const multer = require("multer");
const path = require("path");
const storage = multer.memoryStorage();

const hasAllowedExtension = (fileName = "", allowedExts = []) => {
  const ext = path.extname(fileName).toLowerCase();
  return allowedExts.includes(ext);
};

const getExtension = (fileName = "") => path.extname(fileName).toLowerCase();

const imageFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

  if (allowedMimes.includes(file.mimetype) || hasAllowedExtension(file.originalname, allowedExts)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only JPEG, PNG, GIF, WEBP images allowed"), false);
};

const fileFilter = (req, file, cb) => {
  // For generic attachments, allow broad file types and block only high-risk executable types.
  // This avoids false negatives from inconsistent browser MIME values.
  const blockedExts = [".exe", ".msi", ".bat", ".cmd", ".sh", ".dll", ".com", ".scr"];

  const ext = getExtension(file.originalname);

  if (blockedExts.includes(ext)) {
    cb(new Error("This file type is not allowed"), false);
    return;
  }

  cb(null, true);
};

const voiceFilter = (req, file, cb) => {
  const allowedMimes = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/wav",
    "audio/mpeg",
    "audio/x-wav",
    "audio/mp3",
  ];
  const allowedExts = [".webm", ".ogg", ".mp4", ".wav", ".mp3", ".mpeg", ".m4a"];

  if (allowedMimes.includes(file.mimetype) || hasAllowedExtension(file.originalname, allowedExts)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only audio files allowed"), false);
};

const MAX = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;

module.exports = {
  image: multer({
    storage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
  }),
  file: multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX },
  }),
  voice: multer({
    storage,
    fileFilter: voiceFilter,
    limits: { fileSize: 20 * 1024 * 1024 },
  }),
};
