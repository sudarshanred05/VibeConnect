const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    queryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QueryAnalytics",
      default: null,
      index: true,
    },
    rating: {
      type: String,
      enum: ["positive", "negative"],
      required: true,
    },
    comment: {
      type: String,
      default: "",
      maxlength: 1000,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Feedback", feedbackSchema);
