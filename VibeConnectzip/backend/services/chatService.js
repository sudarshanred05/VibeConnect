const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const { decrypt } = require("../utils/encryption");

const MESSAGE_PREVIEW_MAX = 160;

const decryptPreviewContent = (value) => {
  if (value && typeof value === "object" && value.iv && value.content) {
    try {
      return decrypt(value);
    } catch {
      return "";
    }
  }

  return typeof value === "string" ? value : "";
};

const buildLastMessageText = (message) => {
  if (!message) return "";

  if (message.isDeleted) return "This message was deleted";

  if (message.type === "text" || message.type === "system") {
    const preview = decryptPreviewContent(message.content);
    return preview.slice(0, MESSAGE_PREVIEW_MAX);
  }

  if (message.type === "poll") {
    return `📊 ${(message.metadata?.question || "Poll").slice(0, 120)}`;
  }

  if (message.type === "media") {
    const subtype = message.metadata?.subtype;
    if (subtype === "image") return "🖼️ Photo";
    if (subtype === "voice") return "🎙️ Voice message";
    return `📎 ${message.metadata?.fileName || "File"}`;
  }

  return decryptPreviewContent(message.content).slice(0, MESSAGE_PREVIEW_MAX);
};

const updateLastMessage = async (chatId, message) => {
  const update = {
    lastMessageId: message?._id || null,
    lastMessageText: buildLastMessageText(message),
    lastMessageAt: message?.createdAt || new Date(),
    lastMessageSenderId: message?.senderId || null,
  };

  await Chat.findByIdAndUpdate(chatId, update, { new: false }).lean();
  return update;
};

const isChatMember = async (chatId, userId) => {
  const member = await ChatMember.findOne({ chatId, userId, isActive: { $ne: false } }).select("_id").lean();
  return !!member;
};

const getChatMemberIds = async (chatId) => {
  const members = await ChatMember.find({ chatId, isActive: { $ne: false } }).select("userId -_id").lean();
  return members.map((m) => m.userId.toString());
};

module.exports = {
  updateLastMessage,
  buildLastMessageText,
  isChatMember,
  getChatMemberIds,
};
