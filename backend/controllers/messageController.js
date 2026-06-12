const sanitizeHtml = require("sanitize-html");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const Reaction = require("../models/Reaction");
const SeenStatus = require("../models/SeenStatus");
const PollVote = require("../models/PollVote");
const { attachMessageRelations } = require("../services/messageHydrationService");
const { updateLastMessage } = require("../services/chatService");
const { encrypt, decrypt } = require("../utils/encryption");

const sanitizeText = (value) =>
  sanitizeHtml(value || "", { allowedTags: [], allowedAttributes: {} });

const parseLimit = (value) => {
  const limit = Number(value) || 20;
  return Math.min(Math.max(limit, 1), 50);
};

const stripLegacyPreviewText = (metadata) => {
  const { previewText, ...restMetadata } = metadata || {};
  return restMetadata;
};

const decryptIfNeeded = (value) => {
  if (value && typeof value === "object" && value.iv && value.content) {
    try {
      return decrypt(value);
    } catch {
      return "[Decryption failed]";
    }
  }
  return typeof value === "string" ? value : "";
};

const EDIT_WINDOW_MS = 60 * 60 * 1000;

const extractMentions = (text = "") => {
  const matches = String(text).match(/@([a-zA-Z0-9_.-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
};

const buildReplyPreview = (replyTo) => {
  if (!replyTo) return null;
  const replyType = replyTo.type === "media" ? (replyTo.metadata?.subtype || "media") : replyTo.type;
  const replyContent = decryptIfNeeded(replyTo.content);
  return {
    ...replyTo,
    messageType: replyType,
    content: replyContent,
  };
};

exports.getMessages = async (req, res) => {
  try {
    const chatId = req.query.chatId || req.params.chatId;
    const cursor = req.query.cursor;
    const limit = parseLimit(req.query.limit);
    const viewerId = req.user?.id;

    if (!chatId) {
      return res.status(400).json({ success: false, error: "chatId is required" });
    }

    if (!viewerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const membership = await ChatMember.findOne({ chatId, userId: viewerId })
      .select("isActive removedAt")
      .lean();
    if (!membership) {
      return res.status(403).json({ success: false, error: "Not a member of this chat" });
    }

    const query = { chatId, isDeleted: false };
    const createdAtFilter = {};
    if (cursor) {
      createdAtFilter.$lt = new Date(cursor);
    }
    if (membership.isActive === false && membership.removedAt) {
      createdAtFilter.$lte = new Date(membership.removedAt);
    }
    if (Object.keys(createdAtFilter).length) {
      query.createdAt = createdAtFilter;
    }

    const docs = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate("senderId", "name email avatar module")
      .populate("replyTo", "content type senderId metadata")
      .lean();

    const hasMore = docs.length > limit;
    const pageDocs = hasMore ? docs.slice(0, limit) : docs;
    const hydrated = await attachMessageRelations(pageDocs);
    const data = hydrated.reverse().map((message) => ({
      ...message,
      content: decryptIfNeeded(message.content),
      replyTo: message.replyTo
        ? {
            ...message.replyTo,
            content: decryptIfNeeded(message.replyTo.content),
          }
        : null,
    }));

    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].createdAt : null;

    return res.json({
      success: true,
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.createPoll = async (req, res) => {
  try {
    const { chatId, senderId, question, options = [], expiresAt = null, replyTo = null } = req.body;
    const authUserId = req.user?.id;

    if (!chatId || !senderId || !question || options.length < 2) {
      return res.status(400).json({ success: false, error: "chatId, senderId, question and at least 2 options are required" });
    }

    if (!authUserId || String(authUserId) !== String(senderId)) {
      return res.status(403).json({ success: false, error: "Sender mismatch" });
    }

    const chat = await Chat.findById(chatId).select("_id").lean();
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    const member = await ChatMember.findOne({ chatId, userId: senderId, isActive: { $ne: false } }).lean();
    if (!member) {
      return res.status(403).json({ success: false, error: "You are no longer an active member of this chat" });
    }

    const safeQuestion = sanitizeText(question);
    const safeOptions = options.map((opt) => sanitizeText(opt));

    const message = await Message.create({
      chatId,
      senderId,
      type: "poll",
      content: null,
      metadata: {
        question: safeQuestion,
        options: safeOptions,
        expiresAt,
      },
      replyTo,
      isEdited: false,
      isDeleted: false,
    });

    await updateLastMessage(chatId, message);

    const [hydratedMessage] = await attachMessageRelations([
      await Message.findById(message._id)
        .populate("senderId", "name email avatar module")
        .populate("replyTo", "content type senderId metadata")
        .lean(),
    ]);

    hydratedMessage.content = decryptIfNeeded(hydratedMessage.content);
    hydratedMessage.replyTo = buildReplyPreview(hydratedMessage.replyTo);

    const io = req.app.get("io");
    if (io) {
      io.to(chatId.toString()).emit("receive_message", hydratedMessage);
    }

    return res.status(201).json({ success: true, data: hydratedMessage });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { userId, content } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    if (message.senderId.toString() !== userId) {
      return res.status(403).json({ success: false, error: "Cannot edit others' messages" });
    }

    if (message.type !== "text") {
      return res.status(400).json({ success: false, error: "Only text messages can be edited" });
    }

    const messageAgeMs = Date.now() - new Date(message.createdAt).getTime();
    if (messageAgeMs > EDIT_WINDOW_MS) {
      return res.status(400).json({ success: false, error: "Message can only be edited within 60 minutes" });
    }

    const sanitized = sanitizeText(content);
    message.content = encrypt(sanitized);
    message.isEdited = true;
    message.metadata = {
      ...stripLegacyPreviewText(message.metadata),
      mentions: extractMentions(sanitized),
      editedAt: new Date(),
    };
    await message.save();

    await SeenStatus.deleteMany({ messageId: message._id });

    const chat = await Chat.findById(message.chatId).select("lastMessageId").lean();
    if (chat?.lastMessageId?.toString() === message._id.toString()) {
      await updateLastMessage(message.chatId, message);
    }

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("message_edited", {
        messageId: message._id,
        content: sanitized,
        isEdited: true,
        seenBy: [],
        editedAt: message.metadata?.editedAt || new Date(),
      });
    }

    return res.json({
      success: true,
      data: {
        ...message.toObject(),
        content: sanitized,
        seenBy: [],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { userId } = req.body;
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    const isOwnMessage = message.senderId?.toString() === String(userId);
    const isAiSystemMessage =
      message.type === "system" && message.metadata?.systemSubtype === "ai";

    let canDelete = isOwnMessage;

    if (!canDelete && isAiSystemMessage) {
      const ChatMember = require("../models/ChatMember");
      const activeMembership = await ChatMember.findOne({
        chatId: message.chatId,
        userId,
        isActive: { $ne: false },
      }).lean();

      if (activeMembership) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({ success: false, error: "Cannot delete others messages" });
    }

    message.isDeleted = true;
    message.content = encrypt("This message was deleted");
    message.metadata = stripLegacyPreviewText(message.metadata);
    await message.save();

    await Promise.all([
      Reaction.deleteMany({ messageId: message._id }),
      SeenStatus.deleteMany({ messageId: message._id }),
      PollVote.deleteMany({ messageId: message._id }),
    ]);

    const chat = await Chat.findById(message.chatId).select("lastMessageId").lean();
    if (chat?.lastMessageId?.toString() === message._id.toString()) {
      await updateLastMessage(message.chatId, message);
    }

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("message_deleted", {
        messageId: message._id,
      });
    }

    return res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};



