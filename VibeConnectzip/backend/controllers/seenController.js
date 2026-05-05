const SeenStatus = require("../models/SeenStatus");
const Message = require("../models/Message");
const ChatMember = require("../models/ChatMember");

exports.markAsSeen = async (req, res) => {
  try {
    const { messageId, userId } = req.body;
    if (!messageId || !userId) {
      return res.status(400).json({ success: false, error: "messageId and userId are required" });
    }

    const message = await Message.findById(messageId).select("chatId").lean();
    if (!message) {
      return res.status(404).json({ success: false, error: "Message not found" });
    }

    const member = await ChatMember.findOne({ chatId: message.chatId, userId }).lean();
    if (!member) {
      return res.status(403).json({ success: false, error: "Not a member of this chat" });
    }

    const row = await SeenStatus.findOneAndUpdate(
      { messageId, userId },
      { $setOnInsert: { seenAt: new Date() } },
      { upsert: true, new: true },
    ).lean();

    const now = new Date();
    await ChatMember.updateOne({ chatId: message.chatId, userId }, { $set: { lastReadAt: now } });

    const io = req.app.get("io");
    if (io) {
      io.to(message.chatId.toString()).emit("message_seen", {
        messageId,
        userId,
        seenAt: row.seenAt,
      });
    }

    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Mark all messages in a chat as seen up to a specific timestamp
exports.markChatAsSeen = async (req, res) => {
  try {
    const { chatId, userId } = req.body;
    
    if (!chatId || !userId) {
      return res.status(400).json({ success: false, error: "chatId and userId are required" });
    }

    // Verify user is a member of this chat
    const member = await ChatMember.findOne({ chatId, userId }).lean();
    if (!member) {
      return res.status(403).json({ success: false, error: "Not a member of this chat" });
    }

    const now = new Date();
    
    // Mark every visible chat message, including AI replies stored as system messages.
    const messages = await Message.find({
      chatId,
      isDeleted: false,
      createdAt: { $lte: now },
    }).select("_id").lean();

    if (messages.length > 0) {
      // Bulk create/update SeenStatus for all messages
      const operations = messages.map((msg) => ({
        updateOne: {
          filter: { messageId: msg._id, userId },
          update: {
            $setOnInsert: {
              messageId: msg._id,
              userId,
              seenAt: now,
            },
          },
          upsert: true,
        },
      }));

      if (operations.length > 0) {
        await SeenStatus.bulkWrite(operations);
      }
    }

    // Update ChatMember.lastReadAt - THIS IS CRITICAL FOR UNREAD PERSISTENCE
    await ChatMember.updateOne(
      { chatId, userId }, 
      { $set: { lastReadAt: now } }
    );

    const io = req.app.get("io");
    if (io) {
      io.to(chatId.toString()).emit("chat_marked_seen", {
        chatId,
        userId,
        seenAt: now,
        messageCount: messages.length,
      });
    }

    res.json({ success: true, data: { markedCount: messages.length, seenAt: now } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};