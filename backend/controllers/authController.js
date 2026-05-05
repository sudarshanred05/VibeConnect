const User = require("../models/User");
const { validationResult } = require("express-validator");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/tokens");

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, error: "Email already registered" });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      status: "pending",
      role: null,
      approvedAt: null,
      reminderSent: false,
    });

    res.status(201).json({
      success: true,
      message:
        "Your account is pending admin approval. Please wait up to 2 days.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password +refreshToken",
    );

    if (!user || !user.password) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        success: false,
        error: "Your account is pending admin approval",
      });
    }

    if (user.status === "rejected") {
      return res.status(403).json({
        success: false,
        error: "Your account has been rejected. Contact admin@gmail.com",
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.json({
      success: true,
      accessToken,
      user: userResponse,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, error: "No refresh token" });
    }

    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findById(decoded.userId).select("+refreshToken");

    if (!user || user.refreshToken !== refreshToken) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid refresh token" });
    }

    if (user.status !== "approved") {
      return res
        .status(403)
        .json({ success: false, error: "Account not approved" });
    }

    const newAccessToken = generateAccessToken(user._id);

    res.json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ success: false, error: "Refresh token expired" });
    }
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      const decoded = verifyRefreshToken(refreshToken);
      
      await User.findByIdAndUpdate(decoded.userId, { 
        refreshToken: null,
        pushSubscription: null 
      });
    }

    res.clearCookie("refreshToken");

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.clearCookie("refreshToken");
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -refreshToken")
      .populate("managerId", "name email designation module role");

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
