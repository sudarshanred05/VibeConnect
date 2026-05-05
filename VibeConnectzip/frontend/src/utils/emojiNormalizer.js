// Frontend emoji normalizer for comparison only
// IMPORTANT: Do NOT normalize emojis for storage or display
// Only use for validation and comparison of emoji values

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙌"];

// Normalize emoji for COMPARISON ONLY - removes variation selectors and zero-width joiners
const normalizeEmoji = (emoji) => {
  if (!emoji || typeof emoji !== "string") return "";
  
  // Remove variation selector-16 (U+FE0F) and zero-width joiner (U+200D) for comparison
  return emoji
    .replace(/\uFE0F/g, "")
    .replace(/\u200D/g, "")
    .trim();
};

// Check if emoji is valid based on normalized comparison
const isValidEmoji = (emoji) => {
  if (!emoji || typeof emoji !== "string") return false;
  
  const normalized = normalizeEmoji(emoji);
  const allowedNormalized = ALLOWED_EMOJIS.map(normalizeEmoji);
  return allowedNormalized.includes(normalized);
};

// Normalize emojis in reactions array FOR COMPARISON ONLY
// This is used when comparing emojis, not for storage
const normalizeReactionsForComparison = (reactions) => {
  if (!Array.isArray(reactions)) return [];
  
  return reactions.map((r) => ({
    ...r,
    emoji: normalizeEmoji(r.emoji),
  }));
};

export { normalizeEmoji, isValidEmoji, normalizeReactionsForComparison, ALLOWED_EMOJIS };

