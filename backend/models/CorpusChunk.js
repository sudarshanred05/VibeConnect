const mongoose = require("mongoose");

const corpusChunkSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CorpusDocument",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "General",
      trim: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
    },
    tokenEstimate: {
      type: Number,
      default: 0,
    },
    embedding: {
      type: [Number],
      required: true,
      select: false,
    },
    keywords: {
      type: [String],
      default: [],
      index: true,
    },
  },
  { timestamps: true },
);

corpusChunkSchema.index({ text: "text", section: "text", title: "text", keywords: "text" });
corpusChunkSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model("CorpusChunk", corpusChunkSchema);
