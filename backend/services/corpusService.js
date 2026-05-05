const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const CorpusDocument = require("../models/CorpusDocument");
const CorpusChunk = require("../models/CorpusChunk");
const { embedText, extractKeywords } = require("./vectorService");

const MAX_CHARS = 5200;
const OVERLAP_CHARS = 500;

const CATEGORY_RULES = [
  ["Payroll", /payroll|compensation|salary|tax|tds|pf|esi|form 16|river/i],
  ["Recruitment", /recruit|ats|candidate|interview|offer|bgv|talent acquisition/i],
  ["Performance", /performance|okr|kra|kpi|appraisal|review|succession|9-box/i],
  ["Engagement", /engagement|vibe|survey|enps|recognition|reward/i],
  ["Analytics", /analytics|dashboard|report|insight|prediction|attrition/i],
  ["Security", /security|privacy|gdpr|iso|soc|encryption|vapt|risk|audit|compliance/i],
  ["Implementation", /implementation|inflexion|go-live|migration|hypercare|customer success/i],
  ["Architecture", /architecture|aws|mongodb|kubernetes|istio|terraform|api|integration/i],
  ["Company", /founder|funding|valuation|headquarters|customer|investor|office|vision/i],
  ["Integrations", /integration|sso|saml|marketplace|api|okta|slack|teams|whatsapp/i],
];

const cleanText = (value = "") =>
  String(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

const inferCategory = (section, text) => {
  const haystack = `${section}\n${text}`;
  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack));
  return match?.[0] || "General";
};

const splitLargeSection = (sectionText) => {
  if (sectionText.length <= MAX_CHARS) return [sectionText];

  const chunks = [];
  let start = 0;
  while (start < sectionText.length) {
    let end = Math.min(start + MAX_CHARS, sectionText.length);
    const boundary = sectionText.lastIndexOf("\n\n", end);
    if (boundary > start + 1200) end = boundary;
    chunks.push(sectionText.slice(start, end).trim());
    if (end >= sectionText.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }
  return chunks.filter(Boolean);
};

const chunkMarkdown = (rawText, fallbackTitle = "Darwinbox Knowledge Base") => {
  const text = cleanText(rawText);
  const lines = text.split("\n");
  const sections = [];
  let currentHeading = fallbackTitle;
  let buffer = [];

  const flush = () => {
    const body = cleanText(buffer.join("\n"));
    if (body.length > 80) {
      splitLargeSection(body).forEach((part, index) => {
        sections.push({
          section: index ? `${currentHeading} (${index + 1})` : currentHeading,
          text: part,
        });
      });
    }
    buffer = [];
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].replace(/[#*_`]/g, "").trim();
      buffer.push(line);
      return;
    }
    buffer.push(line);
  });
  flush();

  if (!sections.length && text) {
    splitLargeSection(text).forEach((part, index) => {
      sections.push({
        section: index ? `${fallbackTitle} (${index + 1})` : fallbackTitle,
        text: part,
      });
    });
  }

  return sections;
};

const extractTextFromUpload = async (file) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".pdf" || file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    return parsed.text;
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if ([".txt", ".md", ".markdown"].includes(ext) || /^text\//.test(file.mimetype || "")) {
    return file.buffer.toString("utf8");
  }

  const error = new Error("Only .txt, .md, .pdf, and .docx corpus files are supported");
  error.status = 400;
  throw error;
};

const indexCorpusText = async ({
  title,
  text,
  sourceType = "manual",
  fileName = null,
  mimeType = "text/plain",
  uploadedBy = null,
  replaceSeed = false,
}) => {
  const cleaned = cleanText(text);
  if (cleaned.length < 100) {
    const error = new Error("Corpus text is too small to index");
    error.status = 400;
    throw error;
  }

  if (replaceSeed) {
    const existingSeedDocs = await CorpusDocument.find({ sourceType: "seed" }).select("_id").lean();
    const ids = existingSeedDocs.map((doc) => doc._id);
    if (ids.length) {
      await CorpusChunk.deleteMany({ documentId: { $in: ids } });
      await CorpusDocument.deleteMany({ _id: { $in: ids } });
    }
  }

  const latest = await CorpusDocument.findOne({ title }).sort({ version: -1 }).lean();
  const document = await CorpusDocument.create({
    title,
    sourceType,
    fileName,
    mimeType,
    version: latest ? latest.version + 1 : 1,
    uploadedBy,
  });

  const chunks = chunkMarkdown(cleaned, title).map((chunk) => ({
    documentId: document._id,
    title,
    section: chunk.section,
    category: inferCategory(chunk.section, chunk.text),
    text: chunk.text,
    tokenEstimate: estimateTokens(chunk.text),
    embedding: embedText(`${chunk.section}\n${chunk.text}`),
    keywords: extractKeywords(`${chunk.section}\n${chunk.text}`),
  }));

  await CorpusChunk.insertMany(chunks, { ordered: false });
  document.chunkCount = chunks.length;
  document.status = "indexed";
  await document.save();

  return document;
};

const getCorpusSummary = async () => {
  const [documents, chunkCount, categories] = await Promise.all([
    CorpusDocument.find().sort({ createdAt: -1 }).limit(50).lean(),
    CorpusChunk.countDocuments(),
    CorpusChunk.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    documents,
    chunkCount,
    categories: categories.map((item) => ({ name: item._id, count: item.count })),
  };
};

module.exports = {
  chunkMarkdown,
  extractTextFromUpload,
  getCorpusSummary,
  indexCorpusText,
};
