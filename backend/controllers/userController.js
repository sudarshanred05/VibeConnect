const User = require("../models/User");
const { validationResult } = require("express-validator");

// GET /api/users
exports.getUsers = async (req, res) => {
  try {
    const { module, search } = req.query;
    const filter = {};

    if (module) filter.module = module;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("-socketId -__v")
      .sort({ name: 1 });

    res.json({ success: true, count: users.length, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/users/modules - Get distinct modules
exports.getModules = async (req, res) => {
  try {
    const { MODULES } = require("../models/User");
    res.json({ success: true, data: MODULES });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/users/:id
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-socketId -__v")
      .populate("managerId", "name email role module designation");
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/users
exports.createUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, module: mod, designation } = req.body;

    // Upsert: find existing or create
    let user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      return res.json({ success: true, data: user, existing: true });
    }

    user = await User.create({ name, email, module: mod, designation });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ success: false, error: "Email already registered" });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

// PATCH /api/users/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isOnline, lastSeen: isOnline ? null : new Date() },
      { new: true },
    ).select("-socketId -__v");

    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
