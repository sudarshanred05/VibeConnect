const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const Message = require("../models/Message");
const Reaction = require("../models/Reaction");
const SeenStatus = require("../models/SeenStatus");
const PollVote = require("../models/PollVote");
const User = require("../models/User");
const { attachMessageRelations } = require("../services/messageHydrationService");
const { updateLastMessage } = require("../services/chatService");
const { decrypt } = require("../utils/encryption");

const cleanupMemberArtifacts = async ({ chatId, userId, session = null }) => {
  const queryOpts = session ? { session } : undefined;
  const messageIds = await Message.find({ chatId }).select("_id").lean();
  const ids = messageIds.map((m) => m._id);

  if (!ids.length) return;

  await SeenStatus.deleteMany({ messageId: { $in: ids }, userId }, queryOpts);
  await PollVote.deleteMany({ messageId: { $in: ids }, userId }, queryOpts);
  await Reaction.deleteMany({ messageId: { $in: ids }, userId }, queryOpts);
};

const cascadeDeleteChatData = async (chatId, session = null) => {
  const queryOpts = session ? { session } : undefined;
  const messages = await Message.find({ chatId }).select("_id").lean();
  const messageIds = messages.map((m) => m._id);

  await Message.deleteMany({ chatId }, queryOpts);

  if (messageIds.length) {
    await Reaction.deleteMany({ messageId: { $in: messageIds } }, queryOpts);
    await SeenStatus.deleteMany({ messageId: { $in: messageIds } }, queryOpts);
    await PollVote.deleteMany({ messageId: { $in: messageIds } }, queryOpts);
  }

  await ChatMember.deleteMany({ chatId }, queryOpts);
  await Chat.findByIdAndDelete(chatId, queryOpts);
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

const createAndBroadcastSystemMessage = async ({ req, chatId, senderId, content, notifyUserIds = [] }) => {
  if (!chatId || !senderId || !content) return null;

  const message = await Message.create({
    chatId,
    senderId,
    type: "system",
    content,
  });

  await updateLastMessage(chatId, message);

  const [hydratedMessage] = await attachMessageRelations([
    await Message.findById(message._id)
      .populate("senderId", "name email avatar module designation")
      .lean(),
  ]);

  const payload = {
    ...hydratedMessage,
    content: decryptIfNeeded(hydratedMessage.content),
  };

  const io = req.app.get("io");
  if (io) {
    io.to(chatId.toString()).emit("receive_message", payload);
    notifyUserIds
      .filter(Boolean)
      .forEach((id) => {
        if (String(id) !== String(senderId)) {
          io.to(String(id)).emit("receive_message", payload);
        }
      });
  }

  return payload;
};

const buildMemberSystemMessage = ({ action, actorName, targetName }) => {
  const cleanActor = actorName || "Someone";
  const cleanTarget = targetName || "Someone";

  if (action === "add") {
    return `${cleanActor} added ${cleanTarget} to the group`;
  }

  if (action === "remove") {
    return `${cleanActor} removed ${cleanTarget} from the group`;
  }

  return `${cleanTarget} left the group`;
};

const getChatMembers = async (chatIds) => {
  const rows = await ChatMember.find({ chatId: { $in: chatIds }, isActive: { $ne: false } })
    .populate("userId", "name email module designation avatar isOnline lastSeen role")
    .lean();

  return rows.reduce((acc, row) => {
    const key = row.chatId.toString();
    if (!acc[key]) acc[key] = [];
    if (row.userId) {
      acc[key].push({
        ...row.userId,
        chatRole: row.role,
        joinedAt: row.joinedAt,
        isMuted: row.isMuted,
        lastReadAt: row.lastReadAt,
      });
    }
    return acc;
  }, {});
};

// ============================================================================
// UNREAD MESSAGE PERSISTENCE LOGIC
// ============================================================================
// This function calculates whether a chat has unread messages for a user.
// 
// Unread messages are identified by:
// 1. Chat's lastMessageAt > ChatMember's lastReadAt
// 2. AND the message is from a DIFFERENT user (not from the current user)
// 
// When a user opens a chat:
// - ChatWindow.jsx calls markChatAsSeen() to update ChatMember.lastReadAt
// - This triggers seenController.markChatAsSeen()
// - When user reloads, getUserChats() calls hydrateChats()
// - hydrateChats() compares timestamps to determine if still unread
// ============================================================================

const hydrateChats = async (chats, currentUserId = null) => {
  if (!chats.length) return [];
  const ids = chats.map((c) => c._id);
  const membersByChat = await getChatMembers(ids);
  const currentUserIdStr = currentUserId ? String(currentUserId) : null;

  return chats.map((chat) => {
    const members = membersByChat[chat._id.toString()] || [];
    const currentMember = currentUserIdStr
      ? members.find((m) => String(m?._id) === currentUserIdStr)
      : null;
    
    // Calculate unreadCount: messages from OTHERS sent after lastReadAt
    let unreadCount = 0;
    if (chat.lastMessageAt && currentMember && chat.lastMessageSenderId) {
      const lastReadAt = currentMember.lastReadAt || new Date(0); // default to epoch if never read
      // Only count as unread if:
      // 1. lastMessageAt is newer than lastReadAt
      // 2. Message is not from current user
      // 3. Message is not a system message (though we don't have type in Chat model)
      const isFromOtherUser = chat.lastMessageSenderId.toString() !== currentUserIdStr;
      if (chat.lastMessageAt > lastReadAt && isFromOtherUser) {
        unreadCount = 1; // At least 1 unread (the last message)
      }
    }

    return {
      ...chat,
      members,
      unreadCount,
      lastMessage: chat.lastMessageId
        ? {
            _id: chat.lastMessageId,
            senderId: chat.lastMessageSenderId || null,
            content: chat.lastMessageText,
            createdAt: chat.lastMessageAt,
            messageType: "text",
            seenBy: [],
          }
        : null,
    };
  });
};

exports.getUserChats = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
    }

    const memberships = await ChatMember.find({ userId }).select("chatId").lean();
    const chatIds = memberships.map((m) => m.chatId);

    if (!chatIds.length) {
      return res.json({ success: true, data: [] });
    }

    const chats = await Chat.find({ _id: { $in: chatIds } })
      .populate("createdBy", "name email avatar")
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    const hydrated = await hydrateChats(chats, userId);
    res.json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getChats = exports.getUserChats;

exports.getChatById = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.query.userId || req.user?.id;

    if (userId) {
      const membership = await ChatMember.findOne({ chatId, userId }).lean();
      if (!membership) {
        return res.status(403).json({ success: false, error: "Not a member of this chat" });
      }
    }

    const chat = await Chat.findById(chatId)
      .populate("createdBy", "name email avatar")
      .lean();

    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    const [hydrated] = await hydrateChats([chat], userId);
    res.json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createChat = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { isGroup, name, description, module, members = [], createdBy } = req.body;

    const creatorId = createdBy || req.user?.id;
    if (!creatorId) {
      return res.status(400).json({ success: false, error: "createdBy required" });
    }

    const uniqueMembers = [...new Set([creatorId, ...members])];

    if (!isGroup && uniqueMembers.length !== 2) {
      return res.status(400).json({ success: false, error: "Direct chat must have exactly 2 members" });
    }

    if (!isGroup) {
      const memberObjectIds = uniqueMembers.map((id) => new mongoose.Types.ObjectId(id));
      const directCandidates = await ChatMember.aggregate([
        { $match: { userId: { $in: memberObjectIds } } },
        { $group: { _id: "$chatId", matchedUsers: { $addToSet: "$userId" } } },
        { $match: { "matchedUsers.1": { $exists: true } } },
      ]);

      if (directCandidates.length) {
        const existing = await Chat.findOne({
          _id: { $in: directCandidates.map((c) => c._id) },
          isGroup: false,
        })
          .populate("createdBy", "name email avatar")
          .lean();

        if (existing) {
          const [hydratedExisting] = await hydrateChats([existing], creatorId);
          return res.json({ success: true, data: hydratedExisting, existing: true });
        }
      }
    }

    const chat = await Chat.create({
      name: isGroup ? name : null,
      description: isGroup ? description : null,
      isGroup: !!isGroup,
      createdBy: creatorId,
      module: module || null,
      lastMessageText: "",
      lastMessageAt: null,
    });

    const memberDocs = uniqueMembers.map((userId) => ({
      chatId: chat._id,
      userId,
      role: userId === creatorId ? "admin" : "member",
      joinedAt: new Date(),
      isActive: true,
      removedAt: null,
      removedBy: null,
    }));

    await ChatMember.insertMany(memberDocs, { ordered: false });

    if (isGroup) {
      const creator = await User.findById(creatorId).select("name").lean();
      const systemMessage = await Message.create({
        chatId: chat._id,
        senderId: creatorId,
        type: "system",
        content: `${creator?.name || "Someone"} created the group \"${name}\"`,
      });

      await Chat.findByIdAndUpdate(chat._id, {
        lastMessageId: systemMessage._id,
        lastMessageText: systemMessage.content,
        lastMessageAt: systemMessage.createdAt,
      });
    }

    const created = await Chat.findById(chat._id)
      .populate("createdBy", "name email avatar")
      .lean();
    const [hydrated] = await hydrateChats([created], creatorId);

    const io = req.app.get("io");
    if (io) {
      memberDocs.forEach((member) => {
        io.to(member.userId.toString()).emit("added_to_chat", hydrated);
      });
    }

    res.status(201).json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteGroupChat = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    if (!chat.isGroup) {
      return res.status(400).json({ success: false, error: "Use the leave/delete chat endpoint for direct chats" });
    }

    const requester = await User.findById(userId).select("role").lean();
    const isCreator = String(chat.createdBy) === String(userId);
    const isPlatformAdmin = requester?.role === "admin";

    if (!isCreator && !isPlatformAdmin) {
      return res.status(403).json({ success: false, error: "Only the group creator can delete this group" });
    }

    let session;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await cascadeDeleteChatData(chatId, session);
      });
    } catch (txError) {
      if (session) {
        await session.endSession();
        session = null;
      }
      await cascadeDeleteChatData(chatId);
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.to(chatId.toString()).emit("chat_deleted", { chatId });
      io.emit("chat_deleted", { chatId });
      io.in(chatId.toString()).socketsLeave(chatId.toString());
    }

    res.json({ success: true, message: "Group deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteOrLeaveChat = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ success: false, error: "Chat not found" });
    }

    const existingMembership = await ChatMember.findOne({ chatId, userId, isActive: { $ne: false } }).lean();
    if (!existingMembership) {
      return res.status(403).json({ success: false, error: "Not an active member of this chat" });
    }

    const leavingUser = chat.isGroup
      ? await User.findById(userId).select("name").lean()
      : null;

    if (chat.isGroup) {
      await ChatMember.updateOne(
        { chatId, userId },
        {
          $set: {
            isActive: false,
            removedAt: new Date(),
            removedBy: userId,
          },
        },
      );
      await cleanupMemberArtifacts({ chatId, userId });
    } else {
      await ChatMember.deleteOne({ chatId, userId });
    }

    const remainingMembers = await ChatMember.countDocuments({
      chatId,
      ...(chat.isGroup ? { isActive: { $ne: false } } : {}),
    });
    const shouldDelete = !chat.isGroup && remainingMembers === 0;

    if (shouldDelete) {
      let session;
      try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          await cascadeDeleteChatData(chatId, session);
        });
      } catch (txError) {
        if (session) {
          await session.endSession();
          session = null;
        }
        await cascadeDeleteChatData(chatId);
      } finally {
        if (session) {
          await session.endSession();
        }
      }
    } else if (chat.isGroup) {
      const leavingUserName = leavingUser?.name || "Someone";
      await createAndBroadcastSystemMessage({
        req,
        chatId,
        senderId: userId,
        content: buildMemberSystemMessage({ action: "leave", targetName: leavingUserName }),
      });
    }

    const io = req.app.get("io");
    if (io) {
      if (chat.isGroup) {
        io.to(userId.toString()).emit("removed_from_chat", { chatId });
        io.in(userId.toString()).socketsLeave(chatId.toString());
      } else {
        io.to(userId.toString()).emit("chat_deleted", { chatId });
      }

      if (shouldDelete) {
        io.emit("chat_deleted", { chatId });
      } else {
        const updatedMembers = await ChatMember.find({ chatId, isActive: { $ne: false } })
          .populate("userId", "name email module designation avatar isOnline lastSeen")
          .lean();
        io.to(chatId).emit("chat_updated", {
          chatId,
          members: updatedMembers.map((m) => m.userId).filter(Boolean),
        });
      }
    }

    res.json({ success: true, message: shouldDelete ? "Chat deleted" : "Left chat" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.addMember = async (req, res) => {
  try {
    const chatId = req.params.id;
    const { userId } = req.body;
    const actorId = req.user?.id;

    if (!actorId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat || !chat.isGroup) {
      return res.status(400).json({ success: false, error: "Group chat not found" });
    }

    const [actor, target, previousMembership] = await Promise.all([
      User.findById(actorId).select("name").lean(),
      User.findById(userId).select("name").lean(),
      ChatMember.findOne({ chatId, userId }).lean(),
    ]);

    const actorMembership = await ChatMember.findOne({ chatId, userId: actorId, isActive: { $ne: false } })
      .select("role")
      .lean();
    if (!actorMembership) {
      return res.status(403).json({ success: false, error: "Only active group members can add members" });
    }

    const isActorCreator = String(chat.createdBy) === String(actorId);
    const isActorAdmin = actorMembership.role === "admin";
    if (!isActorCreator && !isActorAdmin) {
      return res.status(403).json({ success: false, error: "Only group admins can add members" });
    }

    if (previousMembership?.isActive === true) {
      return res.json({ success: true, message: "User already active in group" });
    }

    await ChatMember.updateOne(
      { chatId, userId },
      {
        $setOnInsert: { role: "member", joinedAt: new Date() },
        $set: { isActive: true, removedAt: null, removedBy: null },
      },
      { upsert: true },
    );

    const actorName = actor?.name || "Someone";
    const targetName = target?.name || "Someone";
    await createAndBroadcastSystemMessage({
      req,
      chatId,
      senderId: actorId,
      content: buildMemberSystemMessage({ action: "add", actorName, targetName }),
      notifyUserIds: [userId],
    });

    const updatedChat = await Chat.findById(chatId)
      .populate("createdBy", "name email avatar")
      .lean();
    const [hydrated] = await hydrateChats([updatedChat], actorId);

    const io = req.app.get("io");
    if (io) {
      io.to(userId.toString()).emit("added_to_chat", hydrated);
      io.to(chatId).emit("chat_updated", { chatId, members: hydrated.members });
    }

    res.json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const chatId = req.params.id;
    const { userId } = req.params;
    const actorId = req.user?.id;

    if (!actorId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat || !chat.isGroup) {
      return res.status(400).json({ success: false, error: "Group chat not found" });
    }

    const actorMembership = await ChatMember.findOne({ chatId, userId: actorId, isActive: { $ne: false } })
      .select("role")
      .lean();
    if (!actorMembership) {
      return res.status(403).json({ success: false, error: "Only active group members can remove members" });
    }

    const isActorCreator = String(chat.createdBy) === String(actorId);
    const isActorAdmin = actorMembership.role === "admin";
    if (!isActorCreator && !isActorAdmin) {
      return res.status(403).json({ success: false, error: "Only group admins can remove members" });
    }

    if (String(chat.createdBy) === String(userId)) {
      return res.status(400).json({ success: false, error: "Cannot remove the group creator" });
    }

    const [actor, removedUser, targetMembership] = await Promise.all([
      User.findById(actorId).select("name").lean(),
      User.findById(userId).select("name").lean(),
      ChatMember.findOne({ chatId, userId, isActive: { $ne: false } }).lean(),
    ]);

    if (!targetMembership) {
      return res.status(404).json({ success: false, error: "User is not a member of this group" });
    }

    await ChatMember.updateOne(
      { chatId, userId },
      {
        $set: {
          isActive: false,
          removedAt: new Date(),
          removedBy: actorId,
        },
      },
    );

    await cleanupMemberArtifacts({ chatId, userId });

    const removedUserName = removedUser?.name || "Someone";
    const actorName = actor?.name || "Someone";
    const systemText = String(actorId) === String(userId)
      ? buildMemberSystemMessage({ action: "leave", targetName: removedUserName })
      : buildMemberSystemMessage({ action: "remove", actorName, targetName: removedUserName });

    await createAndBroadcastSystemMessage({
      req,
      chatId,
      senderId: actorId,
      content: systemText,
    });

    const updatedChat = await Chat.findById(chatId)
      .populate("createdBy", "name email avatar")
      .lean();
    const [hydrated] = await hydrateChats([updatedChat], actorId);

    const io = req.app.get("io");
    if (io) {
      io.to(userId.toString()).emit("removed_from_chat", { chatId });
      io.in(userId.toString()).socketsLeave(chatId.toString());
      io.to(chatId).emit("chat_updated", { chatId, members: hydrated.members });
    }

    res.json({ success: true, data: hydrated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.replyPrivately = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: "Authentication required" });
    }

    // Fetch message without populate to avoid blocking
    const messageRaw = await Message.findById(messageId)
      .select("senderId content type createdAt")
      .lean();

    if (!messageRaw) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    // Fetch sender data separately (non-blocking)
    const senderInfo = await User.findById(messageRaw.senderId)
      .select("name email avatar module designation")
      .lean();
    
    const message = messageRaw;
    const recipientId = message.senderId;

    if (recipientId.toString() === userId) {
      return res.status(400).json({ success: false, error: "Cannot reply privately to yourself" });
    }

    const memberIds = [userId, recipientId.toString()];
    const memberObjectIds = memberIds.map((id) => new mongoose.Types.ObjectId(id));

    let chatId;
    let isNewChat = false;

    // Find existing 1:1 chat shared by both users.
    // Previous logic used `findOne` with `$in`, which could match a row for only one user,
    // causing false negatives and new chat creation on every click.
    const directCandidates = await ChatMember.aggregate([
      { $match: { userId: { $in: memberObjectIds } } },
      { $group: { _id: "$chatId", matchedUsers: { $addToSet: "$userId" } } },
      { $match: { "matchedUsers.1": { $exists: true } } },
    ]);

    if (directCandidates.length) {
      const candidateIds = directCandidates.map((c) => c._id);
      const directChats = await Chat.find({ _id: { $in: candidateIds }, isGroup: false })
        .select("_id")
        .lean();

      // Ensure we only reuse chats that are truly 1:1 (exactly 2 members).
      for (const directChat of directChats) {
        const totalMembers = await ChatMember.countDocuments({ chatId: directChat._id });
        if (totalMembers === 2) {
          chatId = directChat._id;
          break;
        }
      }
    }

    if (!chatId) {
      isNewChat = true;
      const newChat = await Chat.create({
        name: null,
        isGroup: false,
        createdBy: userId,
        module: null,
      });

      await ChatMember.insertMany([
        { chatId: newChat._id, userId, role: "member", joinedAt: new Date() },
        { chatId: newChat._id, userId: recipientId, role: "member", joinedAt: new Date() },
      ]);

      chatId = newChat._id;
    }

    // Return immediately with just chat ID - frontend navigates instantly
    // Include recipient info for 1:1 chat name display
    res.json({
      success: true,
      data: {
        chat: {
          _id: chatId,
          isGroup: false,
          name: senderInfo.name, // Show sender's name for 1:1 chat
          createdBy: { _id: userId },
          members: [
            {
              _id: recipientId,
              name: senderInfo.name,
              avatar: senderInfo.avatar,
              module: senderInfo.module,
              designation: senderInfo.designation,
              isOnline: false,
            }
          ],
        },
        messageContext: {
          _id: message._id,
          content: decryptIfNeeded(message.content),
          type: message.type,
          messageType: message.type === "media" ? (message.metadata?.subtype || "media") : message.type,
          metadata: message.metadata || {},
          sender: senderInfo,
          createdAt: message.createdAt,
        },
      },
    });

    // Load full chat data in background (non-blocking)
    setImmediate(async () => {
      try {
        const chat = await Chat.findById(chatId)
          .populate("createdBy", "name email avatar")
          .lean();

        const members = await ChatMember.find({ chatId })
          .populate("userId", "name email module designation avatar isOnline lastSeen role")
          .lean();

        const hydrationData = {
          ...chat,
          members: members
            .filter(m => m.userId)
            .map(m => ({
              ...m.userId,
              chatRole: m.role,
              joinedAt: m.joinedAt,
              isMuted: m.isMuted,
              lastReadAt: m.lastReadAt,
            })),
          unreadCount: 0,
        };

        // Emit to both users with full data
        const io = req.app.get("io");
        if (io) {
          io.to(userId.toString()).emit("added_to_chat", hydrationData);
          io.to(recipientId.toString()).emit("added_to_chat", hydrationData);
        }
      } catch (e) {
        // Silent fail
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
