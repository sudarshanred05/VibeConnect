const mongoose = require("mongoose");
const User = require("../models/User");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const Message = require("../models/Message");
const Reaction = require("../models/Reaction");
const SeenStatus = require("../models/SeenStatus");
const PollVote = require("../models/PollVote");
const Report = require("../models/Report");
const { buildLastMessageText } = require("./chatService");

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const deleteChatsWithCascade = async (chatIds, session = null) => {
  if (!chatIds.length) return [];

  const uniqueChatIds = [...new Set(chatIds.map((id) => String(id)))].map(toObjectId);

  const messages = await Message.find({ chatId: { $in: uniqueChatIds } })
    .select("_id")
    .session(session)
    .lean();
  const messageIds = messages.map((m) => m._id);

  if (messageIds.length) {
    await Promise.all([
      Reaction.deleteMany({ messageId: { $in: messageIds } }, { session }),
      SeenStatus.deleteMany({ messageId: { $in: messageIds } }, { session }),
      PollVote.deleteMany({ messageId: { $in: messageIds } }, { session }),
      Report.deleteMany({ messageId: { $in: messageIds } }, { session }),
      Message.updateMany(
        { replyTo: { $in: messageIds } },
        { $set: { replyTo: null } },
        { session },
      ),
    ]);
  }

  await Promise.all([
    Report.deleteMany({ chatId: { $in: uniqueChatIds } }, { session }),
    Message.deleteMany({ chatId: { $in: uniqueChatIds } }, { session }),
    ChatMember.deleteMany({ chatId: { $in: uniqueChatIds } }, { session }),
    Chat.deleteMany({ _id: { $in: uniqueChatIds } }, { session }),
  ]);

  return uniqueChatIds;
};

const refreshChatLastMessage = async (chatId, session = null) => {
  const lastMessage = await Message.findOne({ chatId })
    .sort({ createdAt: -1, _id: -1 })
    .session(session)
    .lean();

  if (!lastMessage) {
    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageId: null,
          lastMessageText: "",
          lastMessageAt: null,
          lastMessageSenderId: null,
        },
      },
      { session },
    );
    return;
  }

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageId: lastMessage._id,
        lastMessageText: buildLastMessageText(lastMessage),
        lastMessageAt: lastMessage.createdAt,
        lastMessageSenderId: lastMessage.senderId,
      },
    },
    { session },
  );
};

const deleteUserCascadeInternal = async (userId, session = null) => {
  const userObjectId = toObjectId(userId);

  const [user, memberships, userMessageRows] = await Promise.all([
    User.findById(userObjectId).session(session).lean(),
    ChatMember.find({ userId: userObjectId }).select("chatId").session(session).lean(),
    Message.find({ senderId: userObjectId }).select("_id chatId").session(session).lean(),
  ]);

  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  if (user.role === "admin") {
    const err = new Error("Cannot delete admin user");
    err.status = 403;
    throw err;
  }

  const membershipChatIds = memberships.map((m) => String(m.chatId));
  const messageIds = userMessageRows.map((m) => m._id);
  const messageChatIds = userMessageRows.map((m) => String(m.chatId));

  let chatRows = [];
  if (membershipChatIds.length) {
    chatRows = await Chat.find({ _id: { $in: membershipChatIds.map(toObjectId) } })
      .select("_id isGroup createdBy")
      .session(session)
      .lean();
  }

  const directChatIds = chatRows.filter((c) => !c.isGroup).map((c) => String(c._id));
  const groupChatIds = chatRows.filter((c) => c.isGroup).map((c) => String(c._id));

  // Remove all interactions made BY this user.
  await Promise.all([
    Reaction.deleteMany({ userId: userObjectId }, { session }),
    SeenStatus.deleteMany({ userId: userObjectId }, { session }),
    PollVote.deleteMany({ userId: userObjectId }, { session }),
    Report.deleteMany(
      {
        $or: [
          { reportedUserId: userObjectId },
          { reportedByUserId: userObjectId },
        ],
      },
      { session },
    ),
    User.updateMany({ managerId: userObjectId }, { $set: { managerId: null } }, { session }),
  ]);

  // Remove embedded report entries where this user reported a message.
  await Message.updateMany(
    { "reports.userId": userObjectId },
    [
      {
        $set: {
          reports: {
            $filter: {
              input: "$reports",
              as: "report",
              cond: { $ne: ["$$report.userId", userObjectId] },
            },
          },
        },
      },
      { $set: { reportCount: { $size: "$reports" } } },
    ],
    { session },
  );

  // Remove all messages sent BY this user (and dependent records).
  if (messageIds.length) {
    await Promise.all([
      Reaction.deleteMany({ messageId: { $in: messageIds } }, { session }),
      SeenStatus.deleteMany({ messageId: { $in: messageIds } }, { session }),
      PollVote.deleteMany({ messageId: { $in: messageIds } }, { session }),
      Report.deleteMany({ messageId: { $in: messageIds } }, { session }),
      Message.updateMany(
        { replyTo: { $in: messageIds } },
        { $set: { replyTo: null } },
        { session },
      ),
      Message.deleteMany({ _id: { $in: messageIds } }, { session }),
    ]);
  }

  // Delete all direct chats that include this user.
  const deletedChatIds = await deleteChatsWithCascade(directChatIds, session);
  const deletedChatIdSet = new Set(deletedChatIds.map((id) => String(id)));

  // For group chats: remove membership and keep chat for remaining users.
  if (groupChatIds.length) {
    await ChatMember.deleteMany(
      { chatId: { $in: groupChatIds.map(toObjectId) }, userId: userObjectId },
      { session },
    );

    const groupsCreatedByUser = chatRows
      .filter((c) => c.isGroup && String(c.createdBy) === String(userObjectId))
      .map((c) => String(c._id));

    for (const chatId of groupsCreatedByUser) {
      const replacement = await ChatMember.findOne({ chatId: toObjectId(chatId) })
        .sort({ role: 1, joinedAt: 1, createdAt: 1 })
        .session(session)
        .lean();

      if (replacement?.userId) {
        await Chat.updateOne(
          { _id: toObjectId(chatId) },
          { $set: { createdBy: replacement.userId } },
          { session },
        );
      }
    }

    // Delete now-empty group chats safely.
    const remainingRows = await ChatMember.aggregate([
      { $match: { chatId: { $in: groupChatIds.map(toObjectId) } } },
      { $group: { _id: "$chatId", count: { $sum: 1 } } },
    ]).session(session);

    const remainingMap = new Map(remainingRows.map((r) => [String(r._id), r.count]));
    const emptyGroupIds = groupChatIds.filter((chatId) => !remainingMap.get(chatId));

    if (emptyGroupIds.length) {
      const deletedGroups = await deleteChatsWithCascade(emptyGroupIds, session);
      deletedGroups.forEach((id) => deletedChatIdSet.add(String(id)));
    }
  }

  // Refresh last-message pointers for affected surviving chats.
  const affectedChatIds = new Set([
    ...membershipChatIds,
    ...messageChatIds,
  ]);

  deletedChatIdSet.forEach((id) => affectedChatIds.delete(id));

  for (const chatId of affectedChatIds) {
    await refreshChatLastMessage(toObjectId(chatId), session);
  }

  await User.deleteOne({ _id: userObjectId }, { session });

  return {
    deletedUserId: String(userObjectId),
    deletedChatIds: [...deletedChatIdSet],
    updatedChatIds: [...affectedChatIds],
  };
};

const deleteUserCascade = async (userId) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await deleteUserCascadeInternal(userId, session);
    });
    return result;
  } catch (err) {
    if (session) {
      await session.endSession();
      session = null;
    }
    return await deleteUserCascadeInternal(userId, null);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

module.exports = {
  deleteUserCascade,
};
