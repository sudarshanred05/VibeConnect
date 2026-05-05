const Message = require("../models/Message");
const { updateLastMessage } = require("../services/chatService");
const { answerQuestion } = require("../services/darwinboxRagService");
const { encrypt } = require("../utils/encryption");

// POST /api/ai/chat
exports.chat = async (req, res) => {
  try {
    const { messages, userId, chatId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Messages array required" });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role !== "assistant");
    const question = String(lastUserMessage?.content || "").trim();
    if (!question) {
      return res.status(400).json({ success: false, error: "Question is required" });
    }

    const result = await answerQuestion({
      question,
      userId: userId || req.user?._id,
      history: messages.slice(0, -1),
    });

    if (chatId && userId) {
      const aiMessage = await Message.create({
        chatId,
        senderId: userId,
        type: "system",
        content: encrypt(result.message),
        metadata: {
          systemSubtype: "ai",
          confidence: result.confidence,
          sources: result.sources,
          queryId: result.queryId,
        },
      });
      await updateLastMessage(chatId, aiMessage);
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
