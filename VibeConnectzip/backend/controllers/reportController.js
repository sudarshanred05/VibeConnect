const { validationResult } = require("express-validator");
const {
  reportUser,
  listPendingReports,
  listPendingRemovals,
  approveReport,
  rejectReport,
  approveRemoval,
  rejectRemoval,
  REPORT_THRESHOLD,
} = require("../services/reportService");
const Message = require("../models/Message");

const respondReportResult = (res, result) => {
  if (result.isDuplicate) {
    return res.status(409).json({
      success: false,
      error: result.message,
      data: { isDuplicate: true, status: result.status },
    });
  }
  return res.json({
    success: true,
    data: {
      status: result.status,
      pendingAdminReview: true,
      message: result.message,
    },
  });
};

exports.reportMessage = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const messageId = req.params.id;
    const reportedByUserId = req.user.id;
    const { reason } = req.body || {};

    const message = await Message.findById(messageId).select("senderId chatId");
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    const reportedUserId = message.senderId.toString();
    const chatId = message.chatId.toString();

    const result = await reportUser(reportedUserId, chatId, reportedByUserId, messageId, reason);

    const io = req.app.get("io");
    if (io && !result.isDuplicate) {
      io.to("admins").emit("report_pending", {
        reportId: result.report?._id?.toString() || null,
        chatId,
        reportedUserId,
      });
    }

    return respondReportResult(res, result);
  } catch (error) {
    console.error("Report error:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Failed to report user";
    res.status(statusCode).json({ success: false, error: message });
  }
};

exports.reportUserInChat = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const reportedUserId = req.params.userId;
    const chatId = req.params.chatId;
    const reportedByUserId = req.user.id;
    const { messageId, reason } = req.body || {};

    const result = await reportUser(reportedUserId, chatId, reportedByUserId, messageId || null, reason);

    const io = req.app.get("io");
    if (io && !result.isDuplicate) {
      io.to("admins").emit("report_pending", {
        reportId: result.report?._id?.toString() || null,
        chatId,
        reportedUserId,
      });
    }

    return respondReportResult(res, result);
  } catch (error) {
    console.error("Report user error:", error);
    const statusCode = error.status || 500;
    const message = error.message || "Failed to report user";
    res.status(statusCode).json({ success: false, error: message });
  }
};

exports.adminListPending = async (req, res) => {
  try {
    const [reports, removals] = await Promise.all([
      listPendingReports(),
      listPendingRemovals(),
    ]);
    res.json({
      success: true,
      data: { reports, removals, threshold: REPORT_THRESHOLD },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.adminApproveReport = async (req, res) => {
  try {
    const io = req.app.get("io");
    const result = await approveReport({
      reportId: req.params.id,
      adminId: req.user.id,
      note: req.body?.note,
      io,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

exports.adminRejectReport = async (req, res) => {
  try {
    const result = await rejectReport({
      reportId: req.params.id,
      adminId: req.user.id,
      note: req.body?.note,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

exports.adminApproveRemoval = async (req, res) => {
  try {
    const io = req.app.get("io");
    const result = await approveRemoval({
      actionId: req.params.id,
      adminId: req.user.id,
      io,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
};

exports.adminRejectRemoval = async (req, res) => {
  try {
    const result = await rejectRemoval({
      actionId: req.params.id,
      adminId: req.user.id,
      note: req.body?.note,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
};
