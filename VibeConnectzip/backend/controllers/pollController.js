const PollVote = require("../models/PollVote");
const Message = require("../models/Message");
const ChatMember = require("../models/ChatMember");

const buildPollPayload = async (message) => {
  const votes = await PollVote.find({ messageId: message._id })
    .select("userId optionIndex")
    .populate("userId", "name email avatar module designation")
    .lean();

  const options = (message.metadata?.options || []).map((text, index) => ({
    text,
    votes: votes.filter((v) => v.optionIndex === index).length,
  }));

  return {
    question: message.metadata?.question || "",
    options,
    expiresAt: message.metadata?.expiresAt || null,
    voters: votes.map((v) => ({
      userId: v.userId,
      optionIndex: v.optionIndex,
    })),
  };
};

exports.votePoll = async (req, res) => {
  try {
    const { messageId, userId, optionIndex } = req.body;
    const authUserId = req.user?.id;
    const shouldClearVote = optionIndex === null;

    if (!messageId || !userId || optionIndex === undefined) {
      return res.status(400).json({ success: false, error: "messageId, userId and optionIndex are required" });
    }

    if (!authUserId || String(authUserId) !== String(userId)) {
      return res.status(403).json({ success: false, error: "User mismatch" });
    }

    const message = await Message.findById(messageId).lean();
    if (!message || message.type !== "poll") {
      return res.status(404).json({ success: false, error: "Poll message not found" });
    }

    const member = await ChatMember.findOne({ chatId: message.chatId, userId, isActive: { $ne: false } }).lean();
    if (!member) {
      return res.status(403).json({ success: false, error: "You are no longer an active member of this chat" });
    }

    if (message.metadata?.expiresAt && new Date() > new Date(message.metadata.expiresAt)) {
      return res.status(400).json({ success: false, error: "Poll has expired" });
    }

    if (shouldClearVote) {
      await PollVote.deleteOne({ messageId, userId });
    } else {
      const options = message.metadata?.options || [];
      if (optionIndex < 0 || optionIndex >= options.length) {
        return res.status(400).json({ success: false, error: "Invalid optionIndex" });
      }

      await PollVote.findOneAndUpdate(
        { messageId, userId },
        { $set: { optionIndex } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    const poll = await buildPollPayload(message);

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("poll_updated", { messageId, poll });
    }

    res.status(200).json({ success: true, data: poll });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
