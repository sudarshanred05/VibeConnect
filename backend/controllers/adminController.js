const User = require("../models/User");
const { validationResult } = require("express-validator");
const { sendApprovalEmail, sendRejectionEmail } = require("../utils/email");
const ChatMember = require("../models/ChatMember");
const { deleteUserCascade } = require("../services/userDeletionService");

const {
  DESIGNATIONS,
  DESIGNATION_LEVELS,
  DESIGNATION_TO_ROLE,
  MODULES,
} = require("../models/User");

const DEFAULT_EMPLOYEE_DESIGNATION = "SDE1";

const legacyRoleToDesignation = (role) => {
  if (role === "manager") return "Manager";
  if (role === "hr") return "HR";
  if (role === "admin") return "Admin";
  return DEFAULT_EMPLOYEE_DESIGNATION;
};

const getDesignationLevel = (designation) => DESIGNATION_LEVELS[designation] || 0;

const roleFromDesignation = (designation) =>
  DESIGNATION_TO_ROLE[designation] || "employee";

const requiresModule = (designation) => !["HR", "Admin"].includes(designation);

const normalizeUserDesignation = (user) => {
  if (user?.designation && DESIGNATIONS.includes(user.designation)) {
    return user.designation;
  }

  if (user?.role === "admin") return "Admin";
  if (user?.role === "hr") return "HR";
  if (user?.role === "manager") return "Manager";
  return DEFAULT_EMPLOYEE_DESIGNATION;
};

const normalizeManagerId = (managerId) => {
  if (!managerId) return null;
  const val = String(managerId).trim();
  return val && val !== "null" && val !== "undefined" ? val : null;
};

const validateManagerAssignment = async ({ userId = null, managerId, module, designation }) => {
  const normalizedManagerId = normalizeManagerId(managerId);
  if (!normalizedManagerId) return { managerId: null };

  if (userId && String(userId) === String(normalizedManagerId)) {
    return { error: "User cannot be their own manager" };
  }

  const manager = await User.findById(normalizedManagerId)
    .select("_id name status module designation managerId")
    .lean();

  if (!manager) {
    return { error: "Selected manager not found" };
  }

  if (manager.status !== "approved") {
    return { error: "Manager must be an approved user" };
  }

  if (module && manager.module !== module) {
    return { error: "Manager must belong to the same module" };
  }

  const userLevel = getDesignationLevel(designation);
  const managerLevel = getDesignationLevel(manager.designation);
  const normalizedManagerLevel = getDesignationLevel(normalizeUserDesignation(manager));

  if (!managerLevel && !normalizedManagerLevel) {
    return { error: "Manager must have a valid designation" };
  }

  if ((managerLevel || normalizedManagerLevel) <= userLevel) {
    return { error: "Manager must be a higher designation level" };
  }

  if (userId) {
    let cursor = manager.managerId ? String(manager.managerId) : null;
    let safety = 0;

    while (cursor && safety < 50) {
      if (cursor === String(userId)) {
        return { error: "Manager assignment creates a circular hierarchy" };
      }
      const next = await User.findById(cursor).select("managerId").lean();
      cursor = next?.managerId ? String(next.managerId) : null;
      safety += 1;
    }
  }

  return { managerId: manager._id };
};

const buildOrgTree = (users) => {
  const nodes = new Map();
  const roots = [];

  users.forEach((user) => {
    nodes.set(String(user._id), {
      _id: user._id,
      name: user.name,
      email: user.email,
      module: user.module,
      role: user.role,
      designation: user.designation,
      managerId: user.managerId ? String(user.managerId) : null,
      children: [],
    });
  });

  nodes.forEach((node) => {
    if (node.managerId && nodes.has(node.managerId)) {
      nodes.get(node.managerId).children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortRecursive = (arr) => {
    arr.sort((a, b) => {
      const levelDiff = getDesignationLevel(b.designation) - getDesignationLevel(a.designation);
      if (levelDiff !== 0) return levelDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    arr.forEach((item) => sortRecursive(item.children));
  };

  sortRecursive(roots);
  return roots;
};

exports.getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: "pending" })
      .select("-password -refreshToken")
      .populate("managerId", "name email designation module")
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      count: pendingUsers.length,
      data: pendingUsers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.approveUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { userId, role, module, designation, managerId } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "User is not in pending status",
      });
    }

    const finalDesignation = designation || legacyRoleToDesignation(role);
    if (!DESIGNATIONS.includes(finalDesignation)) {
      return res.status(400).json({ success: false, error: "Valid designation is required" });
    }

    const finalModule = requiresModule(finalDesignation) ? module : null;
    if (requiresModule(finalDesignation) && !finalModule) {
      return res.status(400).json({ success: false, error: "Module is required for this designation" });
    }

    if (finalModule && !MODULES.includes(finalModule)) {
      return res.status(400).json({ success: false, error: "Invalid module" });
    }

    const managerValidation = await validateManagerAssignment({
      userId,
      managerId,
      module: finalModule,
      designation: finalDesignation,
    });

    if (managerValidation.error) {
      return res.status(400).json({ success: false, error: managerValidation.error });
    }

    user.status = "approved";
    user.role = roleFromDesignation(finalDesignation);
    user.designation = finalDesignation;
    user.module = finalModule;
    user.managerId = managerValidation.managerId;
    user.approvedAt = new Date();

    await user.save();

    await sendApprovalEmail(user);

    res.json({
      success: true,
      message: "User approved successfully",
      data: user,
    });
  } catch (error) {
    console.error("Approve user error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.rejectUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { userId } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (user.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "User is not in pending status",
      });
    }

    user.status = "rejected";
    await user.save();

    await sendRejectionEmail(user);

    res.json({
      success: true,
      message: "User rejected successfully",
    });
  } catch (error) {
    console.error("Reject user error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { status, role, module, designation } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (role) filter.role = role;
    if (module) filter.module = module;
    if (designation) filter.designation = designation;

    const users = await User.find(filter)
      .select("-password -refreshToken")
      .populate("managerId", "name email designation module")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getManagers = async (req, res) => {
  try {
    const { module, designation, excludeUserId } = req.query;
    const designationLevel = getDesignationLevel(designation);
    const filter = { status: "approved" };

    if (module) filter.module = module;

    const candidates = await User.find(filter)
      .select("name email module designation role")
      .sort({ name: 1 })
      .lean();

    const managers = candidates.filter((u) => {
      if (excludeUserId && String(u._id) === String(excludeUserId)) return false;
      const userDesignation = normalizeUserDesignation(u);
      const userLevel = getDesignationLevel(userDesignation);
      if (!userLevel) return false;
      if (designationLevel && userLevel <= designationLevel) return false;
      if (module && u.module !== module) return false;
      return true;
    });

    res.json({
      success: true,
      count: managers.length,
      data: managers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateUserRole = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { userId, role, module, designation, managerId } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const finalDesignation = designation || legacyRoleToDesignation(role || user.role);
    if (!DESIGNATIONS.includes(finalDesignation)) {
      return res.status(400).json({ success: false, error: "Valid designation is required" });
    }

    const finalRole = role || roleFromDesignation(finalDesignation);
    const finalModule = requiresModule(finalDesignation) ? module : null;

    if (requiresModule(finalDesignation) && !finalModule) {
      return res.status(400).json({ success: false, error: "Module is required for this designation" });
    }

    if (finalModule && !MODULES.includes(finalModule)) {
      return res.status(400).json({ success: false, error: "Invalid module" });
    }

    const managerValidation = await validateManagerAssignment({
      userId,
      managerId,
      module: finalModule,
      designation: finalDesignation,
    });

    if (managerValidation.error) {
      return res.status(400).json({ success: false, error: managerValidation.error });
    }

    user.role = finalRole;
    user.designation = finalDesignation;
    user.module = finalModule;
    user.managerId = managerValidation.managerId;

    await user.save();

    res.json({
      success: true,
      message: "User role updated successfully",
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDesignations = async (req, res) => {
  res.json({
    success: true,
    data: DESIGNATIONS.map((name) => ({
      name,
      level: getDesignationLevel(name),
      role: roleFromDesignation(name),
    })),
  });
};

exports.getOrgTree = async (req, res) => {
  try {
    const { module } = req.query;
    const filter = { status: "approved" };
    if (module) filter.module = module;

    const AI_EMAILS = ["ai@vibeconnect.app", "ai@darwinbox.com"];
    const users = await User.find(filter)
      .select("name email module role designation managerId status")
      .sort({ name: 1 })
      .lean();

    const filtered = users.filter(
      (u) => !AI_EMAILS.includes(u.email) && u.name !== "VibeConnect AI" && u.name !== "Darwinbox AI"
    );
    const tree = buildOrgTree(filtered);
    res.json({ success: true, data: tree, count: users.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await deleteUserCascade(userId);

    const io = req.app.get("io");
    if (io) {
      for (const chatId of result.deletedChatIds || []) {
        io.emit("chat_deleted", { chatId });
      }

      for (const chatId of result.updatedChatIds || []) {
        const members = await ChatMember.find({ chatId })
          .populate("userId", "name email module designation avatar isOnline lastSeen role")
          .lean();

        io.to(chatId.toString()).emit("chat_updated", {
          chatId,
          members: members.map((m) => m.userId).filter(Boolean),
        });
      }
    }

    res.json({
      success: true,
      message: "User deleted successfully",
      data: {
        deletedUserId: result.deletedUserId,
        deletedChats: result.deletedChatIds?.length || 0,
        updatedChats: result.updatedChatIds?.length || 0,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ success: false, error: error.message });
  }
};
