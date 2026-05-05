const Feedback = require("../models/Feedback");
const QueryAnalytics = require("../models/QueryAnalytics");
const CorpusChunk = require("../models/CorpusChunk");
const CorpusDocument = require("../models/CorpusDocument");
const {
  extractTextFromUpload,
  getCorpusSummary,
  indexCorpusText,
} = require("../services/corpusService");
const { ensureSeedCorpus } = require("../services/darwinboxRagService");

exports.getSummary = async (req, res) => {
  try {
    await ensureSeedCorpus();
    const summary = await getCorpusSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.uploadCorpus = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Corpus file is required" });
    }

    const text = await extractTextFromUpload(req.file);
    const title = req.body.title?.trim() || req.file.originalname;
    const document = await indexCorpusText({
      title,
      text,
      sourceType: "upload",
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      uploadedBy: req.user?._id,
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.createManualCorpus = async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!title?.trim() || !text?.trim()) {
      return res.status(400).json({ success: false, error: "Title and text are required" });
    }

    const document = await indexCorpusText({
      title: title.trim(),
      text,
      sourceType: "manual",
      uploadedBy: req.user?._id,
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
};

exports.reindexSeed = async (req, res) => {
  try {
    await CorpusChunk.deleteMany({});
    await CorpusDocument.deleteMany({});
    await ensureSeedCorpus();
    const summary = await getCorpusSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const [totalQueries, failedQueries, topQueries, recentFailures, feedback] = await Promise.all([
      QueryAnalytics.countDocuments(),
      QueryAnalytics.countDocuments({ answerStatus: { $ne: "answered" } }),
      QueryAnalytics.aggregate([
        { $group: { _id: "$question", count: { $sum: 1 }, lastAskedAt: { $max: "$createdAt" } } },
        { $sort: { count: -1, lastAskedAt: -1 } },
        { $limit: 10 },
      ]),
      QueryAnalytics.find({ answerStatus: { $ne: "answered" } })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Feedback.aggregate([
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalQueries,
        failedQueries,
        successRate: totalQueries ? Number(((totalQueries - failedQueries) / totalQueries).toFixed(2)) : 0,
        topQueries: topQueries.map((q) => ({
          question: q._id,
          count: q.count,
          lastAskedAt: q.lastAskedAt,
        })),
        recentFailures,
        feedback: feedback.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const { queryId, rating, comment = "" } = req.body;
    const feedback = await Feedback.create({
      userId: req.user._id,
      queryId: queryId || null,
      rating,
      comment,
    });
    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
