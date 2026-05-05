const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
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
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

reactionSchema.index({ messageId: 1, userId: 1 }, { unique: true });
reactionSchema.index({ messageId: 1, emoji: 1, createdAt: -1 });

module.exports = mongoose.model("Reaction", reactionSchema);
