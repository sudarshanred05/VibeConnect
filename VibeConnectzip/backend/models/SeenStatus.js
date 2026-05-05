const mongoose = require("mongoose");

const seenStatusSchema = new mongoose.Schema(
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
    seenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

seenStatusSchema.index({ messageId: 1, userId: 1 }, { unique: true });
seenStatusSchema.index({ userId: 1, seenAt: -1 });

module.exports = mongoose.model("SeenStatus", seenStatusSchema);
