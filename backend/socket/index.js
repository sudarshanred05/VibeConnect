const User = require("../models/User");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const SeenStatus = require("../models/SeenStatus");
const sanitizeHtml = require("sanitize-html");
const { encrypt, decrypt } = require("../utils/encryption");
const { sendPushToUser } = require("../utils/pushService");
const { updateLastMessage, getChatMemberIds } = require("../services/chatService");
const { answerQuestion, summarizeGroupChat, detectSummaryCommand } = require("../services/darwinboxRagService");

const onlineUsers = new Map();
const sanitize = (t) =>
  sanitizeHtml(t || "", { allowedTags: [], allowedAttributes: {} });

const extractMentions = (text = "") => {
  const matches = String(text).match(/@([a-zA-Z0-9_.-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
};

const ensureAiUser = async () => {
  const email = "ai@darwinbox.com";
  let aiUser = await User.findOne({ email });
  if (aiUser) return aiUser;

  aiUser = await User.create({
    name: "Darwinbox AI",
    email,
    role: "admin",
    status: "approved",
    designation: "Admin",
    module: "Admin",
    approvedAt: new Date(),
  });

  return aiUser;
};

const normalizeRealtimeMessage = (message) => {
  const normalized = { ...message };
  const type = normalized.type;

  const decryptIfNeeded = (value) => {
    if (value && typeof value === "object" && value.iv && value.content) {
      try {
        return decrypt(value);
      } catch {
        return "[Decryption failed]";
      }
    }
    return typeof value === "string" ? value : null;
  };

  if (type === "media") {
    normalized.messageType = normalized.metadata?.subtype || "media";
    normalized.fileUrl = decryptIfNeeded(normalized.metadata?.fileUrl) || null;
    normalized.fileName = normalized.metadata?.fileName || null;
    normalized.fileSize = normalized.metadata?.fileSize || null;
    normalized.caption = normalized.metadata?.caption || null;
    normalized.voiceUrl = decryptIfNeeded(normalized.metadata?.voiceUrl) || null;
    normalized.voiceDuration = normalized.metadata?.voiceDuration || null;
  } else if (type === "system" && normalized.metadata?.systemSubtype === "ai") {
    normalized.messageType = "ai";
  } else {
    normalized.messageType = type || "text";
  }

  if (!Array.isArray(normalized.reactions)) normalized.reactions = [];
  if (!Array.isArray(normalized.seenBy)) normalized.seenBy = [];

  if (normalized.content && typeof normalized.content === "object" && normalized.content.iv) {
    try {
      normalized.content = decrypt(normalized.content);
    } catch {
      normalized.content = "[Decryption failed]";
    }
  }

  if (normalized.replyTo?.content && typeof normalized.replyTo.content === "object" && normalized.replyTo.content.iv) {
    try {
      normalized.replyTo.content = decrypt(normalized.replyTo.content);
    } catch {
      normalized.replyTo.content = "[Decryption failed]";
    }
  }

  if (normalized.replyTo) {
    normalized.replyTo.messageType = normalized.replyTo.type === "media"
      ? (normalized.replyTo.metadata?.subtype || "media")
      : normalized.replyTo.type;
    // Decrypt replyTo URLs if present
    if (normalized.replyTo.metadata?.fileUrl) {
      normalized.replyTo.fileUrl = decryptIfNeeded(normalized.replyTo.metadata.fileUrl) || null;
    }
    if (normalized.replyTo.metadata?.voiceUrl) {
      normalized.replyTo.voiceUrl = decryptIfNeeded(normalized.replyTo.metadata.voiceUrl) || null;
    }
  }

  return normalized;
};

module.exports = (io) => {

  User.updateMany({}, { isOnline: false, socketId: null })
    .then(() => console.log("Reset all users to offline status"))
    .catch((err) => console.error("Failed to reset user status:", err));

  io.on("connection", (socket) => {

    socket.on("user_connected", async ({ userId }) => {
      if (!userId) return;

      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);
      socket.userId = userId;

      socket.join(userId);

      try {
        if (onlineUsers.get(userId).size === 1) {
          await User.findByIdAndUpdate(userId, {
            isOnline: true,
            socketId: socket.id,
            lastSeen: null,
          });
          io.emit("user_status", { userId, isOnline: true });
        }

        const memberships = await ChatMember.find({ userId, isActive: { $ne: false } }).select("chatId").lean();
        memberships.forEach((m) => {
          const chat = { _id: m.chatId };
          socket.join(chat._id.toString());
        });
      } catch (e) {
        console.error("user_connected:", e.message);
      }
    });

    socket.on("join_chat", async ({ chatId, userId }) => {
      if (!chatId || !userId) return;

      socket.join(userId);

      try {
        const chat = await Chat.findById(chatId).lean();
        if (!chat) return socket.emit("error", { message: "Chat not found" });
        const isMember = await ChatMember.findOne({ chatId, userId, isActive: { $ne: false } }).lean();
        if (!isMember) return socket.emit("error", { message: "Not a member" });
        socket.join(chatId);
      } catch (e) {
        socket.emit("error", { message: e.message });
      }
    });

    socket.on("leave_chat", ({ chatId }) => {
      if (chatId) socket.leave(chatId);
    });

    socket.on(
      "send_message",
      async ({
        chatId,
        senderId,
        messageType,
        content,
        replyTo,
        fileUrl,
        fileName,
        fileSize,
        voiceUrl,
      }) => {
        if (!chatId || !senderId) return;
        try {
          const chat = await Chat.findById(chatId).lean();
          if (!chat) return socket.emit("error", { message: "Chat not found" });
          const isMember = await ChatMember.findOne({ chatId, userId: senderId, isActive: { $ne: false } }).lean();
          if (!isMember)
            return socket.emit("error", { message: "Not a member" });

          const normalizedType = messageType === "poll" ? "poll" : messageType === "text" ? "text" : "media";
          const sanitized = content ? sanitize(content) : "";
          const mentions = normalizedType === "text" ? extractMentions(sanitized) : [];

          // Encrypt fileUrl and voiceUrl before saving to database
          const encryptedFileUrl = fileUrl ? encrypt(fileUrl) : null;
          const encryptedVoiceUrl = voiceUrl ? encrypt(voiceUrl) : null;

          const msg = await Message.create({
            chatId,
            senderId,
            type: normalizedType,
            content: normalizedType === "text" ? encrypt(sanitized) : null,
            metadata: {
              subtype: normalizedType === "media" ? messageType : undefined,
              fileUrl: encryptedFileUrl || null,
              fileName: fileName || null,
              fileSize: fileSize || null,
              voiceUrl: encryptedVoiceUrl || null,
              ...(mentions.length ? { mentions } : {}),
            },
            replyTo: replyTo || null,
          });

          await updateLastMessage(chatId, msg);

          const populated = await Message.findById(msg._id)
            .populate("senderId", "name email avatar module designation")
            .populate("replyTo", "content type metadata senderId");

          const decryptedMsg = normalizeRealtimeMessage(populated.toObject());
          const memberIds = await getChatMemberIds(chatId);
          memberIds.forEach((m) => {
            io.in(m.toString()).socketsJoin(chatId);
          });

          io.to(chatId).emit("receive_message", decryptedMsg);


          const recipientIds = memberIds
            .map(m => m.toString())
            .filter(id => id !== senderId);

          recipientIds.forEach(async (recipientId) => {
            const chatName = chat.isGroup ? chat.name : decryptedMsg.senderId?.name || 'Someone';
            await sendPushToUser(recipientId, {
              title: chatName,
              body: 'New message',
              url: `/`
            });
          });

          const mentionsAI =
            sanitized &&
            /@(ai|darwinbot|darwinboxai|darwinbox-ai)\b/i.test(sanitized) &&
            normalizedType === "text";

          if (chat.isGroup && mentionsAI) {
            io.to(chatId).emit("typing_status", {
              userId: "ai",
              userName: "Darwinbox AI",
              isTyping: true,
            });

            setTimeout(async () => {
              try {
                let question = sanitized
                  .replace(/@(ai|darwinbot|darwinboxai|darwinbox-ai)\b/gi, "")
                  .trim();

                if (replyTo) {
                  const parentMsg = await Message.findById(replyTo);
                  if (parentMsg && parentMsg.content) {
                    let parentContent = parentMsg.content;
                    if (typeof parentContent === 'object' && parentContent.iv) {
                      parentContent = decrypt(parentContent);
                    }
                    question = `${question}\n\nContext from replied message: ${parentContent}`.trim();
                  }
                }

                if (!question) {
                  question = "Introduce yourself as the Darwinbox knowledge assistant.";
                }

                const isSummaryCommand = detectSummaryCommand(question);

                let result;

                if (isSummaryCommand) {
                  const transcript = await Message.find({ chatId })
                    .sort({ createdAt: -1 })
                    .limit(200)
                    .populate("senderId", "name email")
                    .lean();

                  const ordered = transcript
                    .reverse()
                    .filter((item) => item._id.toString() !== msg._id.toString())
                    .map((item) => {
                      let itemContent = item.content;
                      if (itemContent && typeof itemContent === "object" && itemContent.iv) {
                        try { itemContent = decrypt(itemContent); } catch { itemContent = ""; }
                      }
                      return { ...item, content: itemContent };
                    });

                  result = await summarizeGroupChat({
                    messages: ordered,
                    chatName: chat.name || "the group",
                    userId: senderId,
                  });
                } else {
                  const recentMessages = await Message.find({ chatId })
                    .sort({ createdAt: -1 })
                    .limit(8)
                    .populate("senderId", "name email")
                    .lean();

                  const history = recentMessages
                    .reverse()
                    .filter((item) => item._id.toString() !== msg._id.toString())
                    .map((item) => {
                      const isAiMessage = item.type === "system" && item.metadata?.systemSubtype === "ai";
                      let itemContent = item.content;
                      if (itemContent && typeof itemContent === "object" && itemContent.iv) {
                        itemContent = decrypt(itemContent);
                      }
                      return {
                        role: isAiMessage ? "assistant" : "user",
                        content: isAiMessage
                          ? itemContent
                          : `${item.senderId?.name || "Group member"}: ${itemContent || ""}`,
                      };
                    })
                    .filter((item) => item.content?.trim());

                  result = await answerQuestion({
                    question,
                    userId: senderId,
                    history,
                  });
                }

                const aiUser = await ensureAiUser();
                const aiMsg = await Message.create({
                  chatId,
                  senderId: aiUser._id,
                  type: "system",
                  content: encrypt(result.message),
                  metadata: {
                    systemSubtype: "ai",
                    confidence: result.confidence,
                    sources: result.sources,
                    queryId: result.queryId,
                    status: result.status,
                    model: result.model,
                  },
                  replyTo: msg._id, 
                });

                await updateLastMessage(chatId, aiMsg);

                const populatedAi = await Message.findById(aiMsg._id)
                  .populate("senderId", "name email avatar module designation")
                  .populate("replyTo", "content type metadata senderId");

                const decryptedAiMsg = normalizeRealtimeMessage(populatedAi.toObject());

                io.to(chatId).emit("typing_status", {
                  userId: "ai",
                  isTyping: false,
                });
                io.to(chatId).emit("receive_message", decryptedAiMsg);
              } catch (err) {
                console.error("Proactive AI Error:", err.message);
                io.to(chatId).emit("typing_status", {
                  userId: "ai",
                  isTyping: false,
                });
              }
            }, 2000);
          }
        } catch (e) {
          socket.emit("error", { message: e.message });
        }
      },
    );

    socket.on("typing_start", ({ chatId, userId, userName }) =>
      socket
        .to(chatId)
        .emit("typing_status", { userId, userName, isTyping: true }),
    );

    socket.on("typing_stop", ({ chatId, userId }) =>
      socket.to(chatId).emit("typing_status", { userId, isTyping: false }),
    );

 
    socket.on("mark_seen", async ({ messageId, userId, chatId }) => {
      try {
        const msg = await Message.findById(messageId).lean();
        if (!msg) return;
        await SeenStatus.updateOne(
          { messageId, userId },
          { $setOnInsert: { seenAt: new Date() } },
          { upsert: true },
        );
        io.to(chatId).emit("message_seen", {
          messageId,
          userId,
          seenAt: new Date(),
        });
      } catch (e) {}
    });

    socket.on("disconnect", async () => {
      const userId = socket.userId;
      if (!userId) return;

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          try {
            const lastSeen = new Date();
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              socketId: null,
              lastSeen,
            });
            io.emit("user_status", { userId, isOnline: false, lastSeen });
          } catch (e) {}
        }
      }
    });
  });
};
