const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reportedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Index to prevent duplicate reports from same user within time period
reportSchema.index({ reportedUserId: 1, reportedByUserId: 1, chatId: 1 }, { unique: true });
reportSchema.index({ reportedUserId: 1, chatId: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
