const crypto = require("crypto");

const DIMENSIONS = 384;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with", "what",
  "how", "does", "do", "can", "which", "who", "when", "where", "why",
]);

const tokenize = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#./-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const hashToken = (token) => {
  const digest = crypto.createHash("sha256").update(token).digest();
  return {
    index: digest.readUInt16BE(0) % DIMENSIONS,
    sign: digest[2] % 2 === 0 ? 1 : -1,
  };
};

const normalize = (vector) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

const embedText = (text) => {
  const vector = new Array(DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  tokens.forEach((token) => {
    const { index, sign } = hashToken(token);
    vector[index] += sign;
  });

  return normalize(vector);
};

const cosineSimilarity = (a = [], b = []) => {
  const length = Math.min(a.length, b.length);
  let score = 0;
  for (let i = 0; i < length; i += 1) {
    score += Number(a[i] || 0) * Number(b[i] || 0);
  }
  return score;
};

const extractKeywords = (text, limit = 18) => {
  const counts = new Map();
  tokenize(text).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
};

module.exports = {
  DIMENSIONS,
  embedText,
  cosineSimilarity,
  extractKeywords,
  tokenize,
};
