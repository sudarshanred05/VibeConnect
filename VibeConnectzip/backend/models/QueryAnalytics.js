const mongoose = require("mongoose");

const queryAnalyticsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    answerStatus: {
      type: String,
      enum: ["answered", "not_found", "error"],
      required: true,
      index: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    sources: {
      type: [
        {
          chunkId: { type: mongoose.Schema.Types.ObjectId, ref: "CorpusChunk" },
          title: String,
          section: String,
          category: String,
          score: Number,
        },
      ],
      default: [],
    },
    latencyMs: {
      type: Number,
      default: 0,
    },
    model: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

queryAnalyticsSchema.index({ createdAt: -1 });
queryAnalyticsSchema.index({ question: "text" });

module.exports = mongoose.model("QueryAnalytics", queryAnalyticsSchema);
