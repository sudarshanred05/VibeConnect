const mongoose = require("mongoose");

const reportActionSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      enum: ["remove_user"],
      default: "remove_user",
    },
    triggerCount: {
      type: Number,
      required: true,
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
  { timestamps: true }
);

reportActionSchema.index({ chatId: 1, reportedUserId: 1, status: 1 });

module.exports = mongoose.model("ReportAction", reportActionSchema);
