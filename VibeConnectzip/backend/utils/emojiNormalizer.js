// Normalize emoji strings for validation and comparison only
// DO NOT use for storage - store original emoji with variation selectors

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙌"];

// Normalize emoji by removing variation selectors and zero-width joiners for COMPARISON only
const normalizeEmoji = (emoji) => {
  if (!emoji || typeof emoji !== "string") return "";
  
  // Remove variation selectors (U+FE0F) and zero-width joiners for comparison
  return emoji
    .replace(/\uFE0F/g, "") // Remove variation selector-16
    .replace(/\u200D/g, "") // Remove zero-width joiner
    .trim();
};

// Check if emoji is valid (for validation only - compare normalized, store original)
const isValidEmoji = (emoji) => {
  if (!emoji || typeof emoji !== "string") return false;
  
  const normalized = normalizeEmoji(emoji);
  const allowedNormalized = ALLOWED_EMOJIS.map(normalizeEmoji);
  
  return allowedNormalized.includes(normalized);
};

module.exports = {
  normalizeEmoji,
  isValidEmoji,
  ALLOWED_EMOJIS,
};

