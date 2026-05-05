const Reaction = require("../models/Reaction");
const Message = require("../models/Message");
const { isChatMember } = require("../services/chatService");
const { isValidEmoji, ALLOWED_EMOJIS } = require("../utils/emojiNormalizer");

exports.addReaction = async (req, res) => {
  try {
    const { messageId, userId, emoji } = req.body;

    if (!messageId || !userId || !emoji) {
      return res.status(400).json({ success: false, error: "messageId, userId and emoji are required" });
    }

    // Validate emoji (but store the original)
    if (!isValidEmoji(emoji)) {
      return res.status(400).json({ success: false, error: "Invalid emoji. Allowed emojis: " + ALLOWED_EMOJIS.join(" ") });
    }

    const message = await Message.findById(messageId).select("chatId").lean();
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    const allowed = await isChatMember(message.chatId, userId);
    if (!allowed) {
      return res.status(403).json({ success: false, error: "Not a member of this chat" });
    }

    const reaction = await Reaction.findOneAndUpdate(
      { messageId, userId },
      { $set: { emoji } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    const reactions = await Reaction.find({ messageId })
      .select("_id userId emoji createdAt")
      .populate("userId", "name email avatar module designation")
      .lean()
      .then((recs) =>
        recs.map((r) => ({
          _id: r._id,
          userId: r.userId,
          userName: r.userId?.name || "Unknown User",
          emoji: r.emoji,
          createdAt: r.createdAt,
        }))
      );

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("reaction_updated", { messageId, reactions });
      io.to(message.chatId.toString()).emit("reaction_added", { messageId, reactions });
    }

    res.status(201).json({ success: true, data: reaction, reactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.removeReaction = async (req, res) => {
  try {
    const { messageId, userId } = req.body;

    if (!messageId || !userId) {
      return res.status(400).json({ success: false, error: "messageId and userId are required" });
    }

    const message = await Message.findById(messageId).select("chatId").lean();
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    await Reaction.deleteOne({ messageId, userId });
    const reactions = await Reaction.find({ messageId })
      .select("_id userId emoji createdAt")
      .populate("userId", "name email avatar module designation")
      .lean()
      .then((recs) =>
        recs.map((r) => ({
          _id: r._id,
          userId: r.userId,
          userName: r.userId?.name || "Unknown User",
          emoji: r.emoji,
          createdAt: r.createdAt,
        }))
      );

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("reaction_updated", { messageId, reactions });
      io.to(message.chatId.toString()).emit("reaction_added", { messageId, reactions });
    }

    res.json({ success: true, reactions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
