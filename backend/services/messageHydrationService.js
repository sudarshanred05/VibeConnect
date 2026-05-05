const Reaction = require("../models/Reaction");
const SeenStatus = require("../models/SeenStatus");
const PollVote = require("../models/PollVote");
const ChatMember = require("../models/ChatMember");
const { decrypt } = require("../utils/encryption");

const groupByMessageId = (rows, mapper) => {
  return rows.reduce((acc, row) => {
    const key = row.messageId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(mapper(row));
    return acc;
  }, {});
};

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

const attachMessageRelations = async (messages) => {
  if (!messages.length) return messages;

  const messageIds = messages.map((m) => m._id);
  const chatIds = [...new Set(messages.map((m) => m.chatId?.toString()).filter(Boolean))];

  const activeMembershipRows = chatIds.length
    ? await ChatMember.find({ chatId: { $in: chatIds }, isActive: { $ne: false } })
        .select("chatId userId")
        .lean()
    : [];

  const activeUserIdsByChat = activeMembershipRows.reduce((acc, row) => {
    const chatKey = row.chatId.toString();
    if (!acc[chatKey]) acc[chatKey] = new Set();
    acc[chatKey].add(row.userId.toString());
    return acc;
  }, {});

  const isActiveForMessage = (messageId, userId) => {
    const message = messages.find((item) => item._id.toString() === messageId.toString());
    if (!message) return false;
    const activeIds = activeUserIdsByChat[message.chatId?.toString?.()] || activeUserIdsByChat[String(message.chatId)] || null;
    if (!activeIds) return true;
    return activeIds.has(userId.toString());
  };

  const [reactions, seenRows, pollVotes] = await Promise.all([
    Reaction.find({ messageId: { $in: messageIds } })
      .select("messageId userId emoji createdAt")
      .populate("userId", "name email avatar module designation")
      .lean(),
    SeenStatus.find({ messageId: { $in: messageIds } })
      .select("messageId userId seenAt")
      .lean(),
    PollVote.find({ messageId: { $in: messageIds } })
      .select("messageId userId optionIndex")
      .populate("userId", "name email avatar module designation")
      .lean(),
  ]);

  const filteredReactions = reactions.filter((reaction) => isActiveForMessage(reaction.messageId, reaction.userId?._id || reaction.userId));
  const filteredSeenRows = seenRows.filter((seen) => isActiveForMessage(seen.messageId, seen.userId));
  const filteredPollVotes = pollVotes.filter((vote) => isActiveForMessage(vote.messageId, vote.userId?._id || vote.userId));

  const reactionsByMessage = groupByMessageId(filteredReactions, (r) => ({
    _id: r._id,
    userId: r.userId,
    userName: r.userId?.name || "Unknown User",
    emoji: r.emoji,
    createdAt: r.createdAt,
  }));

  const seenByMessage = groupByMessageId(filteredSeenRows, (s) => ({
    userId: s.userId,
    seenAt: s.seenAt,
  }));

  const pollVotesByMessage = groupByMessageId(filteredPollVotes, (v) => ({
    userId: v.userId,
    optionIndex: v.optionIndex,
  }));

  return messages.map((message) => {
    const id = message._id.toString();
    const votes = pollVotesByMessage[id] || [];
    let messageType;
    if (message.type === "media") {
      messageType = message.metadata?.subtype || "media";
    } else if (message.type === "system" && message.metadata?.systemSubtype === "ai") {
      messageType = "ai";
    } else {
      messageType = message.type;
    }

    const hydratedReplyTo = message.replyTo
      ? {
          ...message.replyTo,
          messageType: message.replyTo.type === "media"
            ? (message.replyTo.metadata?.subtype || "media")
            : message.replyTo.type,
        }
      : null;

    let poll = null;
    if (message.type === "poll") {
      const options = Array.isArray(message.metadata?.options)
        ? message.metadata.options.map((text, index) => ({
            text,
            votes: votes.filter((v) => v.optionIndex === index).length,
          }))
        : [];

      poll = {
        question: message.metadata?.question || "",
        options,
        expiresAt: message.metadata?.expiresAt || null,
        voters: votes,
      };
    }

    return {
      ...message,
      replyTo: hydratedReplyTo,
      messageType,
      fileUrl: decryptIfNeeded(message.metadata?.fileUrl) || null,
      fileName: message.metadata?.fileName || null,
      fileSize: message.metadata?.fileSize || null,
      caption: message.metadata?.caption || null,
      voiceUrl: decryptIfNeeded(message.metadata?.voiceUrl) || null,
      voiceDuration: message.metadata?.voiceDuration || null,
      reactions: reactionsByMessage[id] || [],
      seenBy: seenByMessage[id] || [],
      poll,
    };
  });
};

module.exports = {
  attachMessageRelations,
};
