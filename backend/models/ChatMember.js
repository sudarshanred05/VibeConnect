const mongoose = require("mongoose");

const chatMemberSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    removedAt: {
      type: Date,
      default: null,
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

chatMemberSchema.index({ chatId: 1, userId: 1 }, { unique: true });
chatMemberSchema.index({ userId: 1, chatId: 1 });
chatMemberSchema.index({ chatId: 1, joinedAt: 1 });
chatMemberSchema.index({ chatId: 1, isActive: 1 });

module.exports = mongoose.model("ChatMember", chatMemberSchema);
