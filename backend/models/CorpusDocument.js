const mongoose = require("mongoose");

const corpusDocumentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    sourceType: {
      type: String,
      enum: ["seed", "upload", "manual"],
      default: "upload",
    },
    fileName: {
      type: String,
      default: null,
      trim: true,
    },
    mimeType: {
      type: String,
      default: "text/plain",
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ["indexed", "failed"],
      default: "indexed",
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

corpusDocumentSchema.index({ sourceType: 1, version: -1 });
corpusDocumentSchema.index({ title: "text", fileName: "text" });

module.exports = mongoose.model("CorpusDocument", corpusDocumentSchema);
