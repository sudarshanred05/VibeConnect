const mongoose = require("mongoose");

const pollVoteSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    optionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

pollVoteSchema.index({ messageId: 1, userId: 1 }, { unique: true });
pollVoteSchema.index({ messageId: 1, optionIndex: 1 });

module.exports = mongoose.model("PollVote", pollVoteSchema);
