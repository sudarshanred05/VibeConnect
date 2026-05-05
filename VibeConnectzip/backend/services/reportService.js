const Message = require("../models/Message");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const Report = require("../models/Report");
const ReportAction = require("../models/ReportAction");

const REPORT_THRESHOLD = 5;

const isUserInChat = async (userId, chatId) => {
  const membership = await ChatMember.findOne({ userId, chatId }).lean();
  return !!membership;
};

const countApprovedReports = async (reportedUserId, chatId) =>
  Report.countDocuments({ reportedUserId, chatId, status: "approved" });

const ensureRemovalQueued = async ({ chatId, reportedUserId, triggerCount, io }) => {
  const existing = await ReportAction.findOne({
    chatId,
    reportedUserId,
    actionType: "remove_user",
    status: "pending",
  });
  if (existing) return existing;

  const queued = await ReportAction.create({
    chatId,
    reportedUserId,
    actionType: "remove_user",
    triggerCount,
    status: "pending",
  });

  if (io) {
    io.to("admins").emit("report_action_pending", {
      actionId: queued._id.toString(),
      chatId: chatId.toString(),
      reportedUserId: reportedUserId.toString(),
      triggerCount,
    });
  }

  return queued;
};

const reportUser = async (
  reportedUserId,
  chatId,
  reportedByUserId,
  messageId,
  reason
) => {
  const chat = await Chat.findById(chatId);
  if (!chat) throw { status: 404, message: "Chat not found" };
  if (!chat.isGroup)
    throw { status: 400, message: "Reporting is only allowed in group chats" };

  const message = messageId ? await Message.findById(messageId) : null;
  if (messageId && !message)
    throw { status: 404, message: "Message not found" };
  if (message && message.isDeleted)
    throw { status: 400, message: "Cannot report deleted message" };
  if (String(reportedUserId) === String(reportedByUserId))
    throw { status: 400, message: "Cannot report yourself" };

  const reporterIsMember = await isUserInChat(reportedByUserId, chatId);
  if (!reporterIsMember)
    throw { status: 403, message: "Not a member of this chat" };

  const reportedUserIsMember = await isUserInChat(reportedUserId, chatId);
  if (!reportedUserIsMember)
    throw { status: 403, message: "User is not a member of this chat" };

  const existingReport = await Report.findOne({
    reportedUserId,
    reportedByUserId,
    chatId,
  });

  if (existingReport) {
    return {
      report: existingReport,
      isDuplicate: true,
      status: existingReport.status,
      message:
        existingReport.status === "pending"
          ? "You have already reported this user. Awaiting admin review."
          : `You have already reported this user (${existingReport.status}).`,
    };
  }

  let report;
  try {
    report = await Report.create({
      reportedUserId,
      reportedByUserId,
      messageId: messageId || null,
      chatId,
      reason: reason || null,
      reportedAt: new Date(),
      status: "pending",
    });
  } catch (saveError) {
    if (saveError.code === 11000) {
      return {
        report: null,
        isDuplicate: true,
        status: "pending",
        message: "You have already reported this user. Awaiting admin review.",
      };
    }
    throw saveError;
  }

  return {
    report,
    isDuplicate: false,
    status: "pending",
    message: "Report submitted. An admin will review it shortly.",
  };
};

const listPendingReports = async () => {
  const reports = await Report.find({ status: "pending" })
    .sort({ createdAt: -1 })
    .populate("reportedUserId", "name email avatar designation module")
    .populate("reportedByUserId", "name email avatar designation module")
    .populate("chatId", "name isGroup")
    .lean();

  const messageIds = reports.map((r) => r.messageId).filter(Boolean);
  const messages = messageIds.length
    ? await Message.find({ _id: { $in: messageIds } })
        .select("_id content type metadata isDeleted createdAt")
        .lean()
    : [];
  const messageMap = new Map(messages.map((m) => [String(m._id), m]));

  return reports.map((r) => {
    const msg = r.messageId ? messageMap.get(String(r.messageId)) : null;
    let preview = null;
    if (msg) {
      let raw = msg.content;
      if (raw && typeof raw === "object" && raw.iv) {
        try {
          const { decrypt } = require("../utils/encryption");
          raw = decrypt(raw);
        } catch {
          raw = "[encrypted]";
        }
      }
      preview = {
        _id: msg._id,
        type: msg.type,
        isDeleted: !!msg.isDeleted,
        createdAt: msg.createdAt,
        snippet: typeof raw === "string" ? raw.slice(0, 240) : null,
      };
    }
    return { ...r, messagePreview: preview };
  });
};

const listPendingRemovals = async () => {
  return ReportAction.find({ status: "pending", actionType: "remove_user" })
    .sort({ createdAt: -1 })
    .populate("reportedUserId", "name email avatar designation module")
    .populate("chatId", "name isGroup")
    .lean();
};

const approveReport = async ({ reportId, adminId, io, note = null }) => {
  const report = await Report.findById(reportId);
  if (!report) throw { status: 404, message: "Report not found" };
  if (report.status !== "pending")
    throw { status: 400, message: `Report already ${report.status}` };

  report.status = "approved";
  report.reviewedBy = adminId;
  report.reviewedAt = new Date();
  if (note) report.reviewNote = String(note).slice(0, 500);
  await report.save();

  const approvedCount = await countApprovedReports(
    report.reportedUserId,
    report.chatId
  );

  let queuedRemoval = null;
  if (approvedCount >= REPORT_THRESHOLD) {
    queuedRemoval = await ensureRemovalQueued({
      chatId: report.chatId,
      reportedUserId: report.reportedUserId,
      triggerCount: approvedCount,
      io,
    });
  }

  if (io) {
    io.to(report.chatId.toString()).emit("user_reported", {
      reportedUserId: report.reportedUserId.toString(),
      reportCount: approvedCount,
      threshold: REPORT_THRESHOLD,
      messageId: report.messageId ? report.messageId.toString() : null,
      reportedBy: report.reportedByUserId.toString(),
      adminApproved: true,
    });
  }

  return {
    report,
    approvedCount,
    threshold: REPORT_THRESHOLD,
    queuedRemoval,
  };
};

const rejectReport = async ({ reportId, adminId, note = null }) => {
  const report = await Report.findById(reportId);
  if (!report) throw { status: 404, message: "Report not found" };
  if (report.status !== "pending")
    throw { status: 400, message: `Report already ${report.status}` };

  report.status = "rejected";
  report.reviewedBy = adminId;
  report.reviewedAt = new Date();
  if (note) report.reviewNote = String(note).slice(0, 500);
  await report.save();

  return { report };
};

const approveRemoval = async ({ actionId, adminId, io }) => {
  const action = await ReportAction.findById(actionId);
  if (!action) throw { status: 404, message: "Action not found" };
  if (action.status !== "pending")
    throw { status: 400, message: `Action already ${action.status}` };

  await ChatMember.deleteOne({
    userId: action.reportedUserId,
    chatId: action.chatId,
  });

  await Message.updateMany(
    { senderId: action.reportedUserId, chatId: action.chatId },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedReason: "USER_REPORTED",
      },
    }
  );

  action.status = "approved";
  action.reviewedBy = adminId;
  action.reviewedAt = new Date();
  await action.save();

  if (io) {
    const chatId = action.chatId.toString();
    const userId = action.reportedUserId.toString();
    io.to(chatId).emit("user_removed_by_report", {
      reportedUserId: userId,
      reason: "Multiple reports approved by admin",
    });
    io.to(userId).emit("removed_from_chat", { chatId });
    io.in(userId).socketsLeave(chatId);
  }

  return { action };
};

const rejectRemoval = async ({ actionId, adminId, note = null }) => {
  const action = await ReportAction.findById(actionId);
  if (!action) throw { status: 404, message: "Action not found" };
  if (action.status !== "pending")
    throw { status: 400, message: `Action already ${action.status}` };

  action.status = "rejected";
  action.reviewedBy = adminId;
  action.reviewedAt = new Date();
  if (note) action.reviewNote = String(note).slice(0, 500);
  await action.save();
  return { action };
};

const getReportCount = async (reportedUserId, chatId) =>
  countApprovedReports(reportedUserId, chatId);

module.exports = {
  reportUser,
  listPendingReports,
  listPendingRemovals,
  approveReport,
  rejectReport,
  approveRemoval,
  rejectRemoval,
  getReportCount,
  REPORT_THRESHOLD,
};
