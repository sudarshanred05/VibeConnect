const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "media", "poll", "system"],
      default: "text",
      alias: "messageType",
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedReason: {
      type: String,
      enum: ["REPORTED", "USER", "ADMIN"],
      default: null,
    },
    reports: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        reportedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ "reports.userId": 1 });
messageSchema.index({ chatId: 1, reportCount: 1 });

module.exports = mongoose.model("Message", messageSchema);
