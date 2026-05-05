const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    module: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageText: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

chatSchema.index({ isGroup: 1, module: 1 });
chatSchema.index({ lastMessageAt: -1, updatedAt: -1 });
chatSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("Chat", chatSchema);
