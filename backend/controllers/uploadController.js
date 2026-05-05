const path = require("path");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const aws4 = require("aws4");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const ChatMember = require("../models/ChatMember");
const { updateLastMessage } = require("../services/chatService");
const { encrypt: encryptUrl, decrypt: decryptUrl } = require("../utils/encryption");

const s3Region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const s3Bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME;
const s3Endpoint = process.env.AWS_S3_ENDPOINT;
const forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE === "true";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const awsSessionToken = process.env.AWS_SESSION_TOKEN;
const MEDIA_PREFIX_REGEX = /(images|files|voice)\/.*$/;

const parseReplyToId = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  return /^[a-f\d]{24}$/i.test(raw) ? raw : null;
};

const decryptIfEncrypted = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value.iv && value.content) {
    try {
      return decryptUrl(value);
    } catch {
      return "[Decryption failed]";
    }
  }
  return typeof value === "string" ? value : "";
};

const buildReplyPreview = (replyMessage) => {
  if (!replyMessage) return null;
  const replyType = replyMessage.type === "media"
    ? (replyMessage.metadata?.subtype || "media")
    : replyMessage.type;

  return {
    ...replyMessage,
    messageType: replyType,
    content: decryptIfEncrypted(replyMessage.content),
    fileUrl: replyMessage.metadata?.fileUrl ? decryptIfEncrypted(replyMessage.metadata.fileUrl) : null,
    voiceUrl: replyMessage.metadata?.voiceUrl ? decryptIfEncrypted(replyMessage.metadata.voiceUrl) : null,
  };
};

const ensureS3Config = () => {
  if (!s3Bucket) {
    throw new Error("S3 bucket is not configured. Set AWS_S3_BUCKET or S3_BUCKET_NAME.");
  }
  if (!s3Region && !s3Endpoint) {
    throw new Error("AWS region is not configured. Set AWS_REGION/AWS_DEFAULT_REGION or AWS_S3_ENDPOINT.");
  }
  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error("AWS credentials are missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }
};

const buildS3RequestTarget = (key) => {
  const endpointUrl = s3Endpoint ? new URL(s3Endpoint) : null;
  const isCustomEndpoint = !!endpointUrl;
  const protocol = endpointUrl?.protocol || "https:";
  const hostname = isCustomEndpoint
    ? endpointUrl.hostname
    : forcePathStyle
      ? `s3.${s3Region}.amazonaws.com`
      : `${s3Bucket}.s3.${s3Region}.amazonaws.com`;

  const basePath = endpointUrl?.pathname && endpointUrl.pathname !== "/" ? endpointUrl.pathname.replace(/\/$/, "") : "";
  const objectPath = forcePathStyle || isCustomEndpoint
    ? `${basePath}/${s3Bucket}/${key}`
    : `${basePath}/${key}`;

  return {
    endpointUrl,
    protocol,
    hostname,
    objectPath,
  };
};

const normalizeS3Key = (rawValue = "") => {
  let value = String(rawValue || "").trim();
  if (!value) return "";

  value = value.split("?")[0];

  // Already a clean key
  if (MEDIA_PREFIX_REGEX.test(value)) {
    const match = value.match(MEDIA_PREFIX_REGEX);
    return match ? match[0] : value;
  }

  // Absolute URL (S3/public endpoint)
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      value = (u.pathname || "").replace(/^\/+/, "");
    } catch {
      // keep original fallback
    }
  }

  // Strip leading slash and optional bucket segment
  value = value.replace(/^\/+/, "");
  if (s3Bucket && value.startsWith(`${s3Bucket}/`)) {
    value = value.slice(s3Bucket.length + 1);
  }

  const mediaMatch = value.match(MEDIA_PREFIX_REGEX);
  return mediaMatch ? mediaMatch[0] : value;
};

const putObjectSigned = ({ key, body, contentType, fileName, dispositionType = "inline" }) => {
  ensureS3Config();
  const { endpointUrl, protocol, hostname, objectPath } = buildS3RequestTarget(key);

  const headers = {
    "Content-Type": contentType || "application/octet-stream",
    "Content-Length": Buffer.byteLength(body),
    "Content-Disposition": `${dispositionType}; filename="${encodeURIComponent(fileName || "file")}"`,
  };

  const signed = aws4.sign(
    {
      host: hostname,
      method: "PUT",
      path: objectPath,
      service: "s3",
      region: s3Region,
      headers,
      body,
    },
    {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      sessionToken: awsSessionToken,
    },
  );

  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: "PUT",
      hostname,
      path: objectPath,
      headers: signed.headers,
      port: endpointUrl?.port || (protocol === "http:" ? 80 : 443),
    };

    const transport = protocol === "http:" ? http : https;
    const req = transport.request(requestOptions, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`S3 upload failed (${res.statusCode}): ${responseBody || "Unknown error"}`));
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

exports.streamMedia = async (req, res) => {
  try {
    ensureS3Config();
    const requestedKey = req.query.key || req.params[0] || "";
    const normalizedKey = normalizeS3Key(decodeURIComponent(String(requestedKey || "")));

    if (!normalizedKey) {
      return res.status(400).json({ success: false, error: "media key is required" });
    }
    if (normalizedKey.includes("..")) {
      return res.status(400).json({ success: false, error: "invalid media key" });
    }

    const { endpointUrl, protocol, hostname, objectPath } = buildS3RequestTarget(normalizedKey);

    const signed = aws4.sign(
      {
        host: hostname,
        method: "GET",
        path: objectPath,
        service: "s3",
        region: s3Region,
      },
      {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
        sessionToken: awsSessionToken,
      },
    );

    const requestOptions = {
      method: "GET",
      hostname,
      path: objectPath,
      headers: signed.headers,
      port: endpointUrl?.port || (protocol === "http:" ? 80 : 443),
    };

    const transport = protocol === "http:" ? http : https;
    const upstreamReq = transport.request(requestOptions, (upstreamRes) => {
      if (upstreamRes.statusCode >= 200 && upstreamRes.statusCode < 300) {
        const contentType = upstreamRes.headers["content-type"] || "application/octet-stream";
        const contentLength = upstreamRes.headers["content-length"];
        const fileName = req.query.filename || path.basename(normalizedKey);
        const dispositionType = req.query.disposition === "attachment" ? "attachment" : "inline";

        res.setHeader("Content-Type", contentType);
        if (contentLength) res.setHeader("Content-Length", contentLength);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Content-Disposition", `${dispositionType}; filename=\"${encodeURIComponent(fileName)}\"`);

        upstreamRes.pipe(res);
        return;
      }

      let responseBody = "";
      upstreamRes.on("data", (chunk) => {
        responseBody += chunk;
      });
      upstreamRes.on("end", () => {
        res.status(upstreamRes.statusCode || 502).json({
          success: false,
          error: `S3 fetch failed (${upstreamRes.statusCode}): ${responseBody || "Unknown error"}`,
        });
      });
    });

    upstreamReq.on("error", (err) => {
      res.status(502).json({ success: false, error: err.message });
    });
    upstreamReq.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getS3PublicBaseUrl = () => {
  if (process.env.S3_PUBLIC_BASE_URL) return process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (s3Endpoint) return s3Endpoint.replace(/\/$/, "") + (forcePathStyle ? `/${s3Bucket}` : "");
  if (!s3Bucket || !s3Region) return null;
  if (forcePathStyle) return `https://s3.${s3Region}.amazonaws.com/${s3Bucket}`;
  return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`;
};

const uploadToS3 = async ({ file, folder, dispositionType = "inline" }) => {
  ensureS3Config();
  if (!file?.buffer) {
    throw new Error("Uploaded file buffer is missing. Ensure multer uses memoryStorage.");
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  const hash = crypto.randomBytes(8).toString("hex");
  const key = `${folder}/${Date.now()}-${hash}${ext}`;

  await putObjectSigned({
    key,
    body: file.buffer,
    contentType: file.mimetype,
    fileName: file.originalname,
    dispositionType,
  });

  const baseUrl = getS3PublicBaseUrl();
  return baseUrl ? `${baseUrl}/${key}` : key;
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// POST /api/upload/image
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });

    const { chatId, senderId } = req.body;
    const authUserId = req.user?.id;
    const replyTo = parseReplyToId(req.body.replyTo);
    if (!chatId || !senderId) {
      return res
        .status(400)
        .json({ success: false, error: "chatId and senderId required" });
    }

    if (!authUserId || String(authUserId) !== String(senderId)) {
      return res.status(403).json({ success: false, error: "Sender mismatch" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat)
      return res.status(404).json({ success: false, error: "Chat not found" });

    const isMember = await ChatMember.findOne({ chatId, userId: senderId, isActive: { $ne: false } }).lean();
    if (!isMember)
      return res.status(403).json({ success: false, error: "You are no longer an active member" });

    const fileUrl = await uploadToS3({ file: req.file, folder: "images", dispositionType: "inline" });
    const { caption } = req.body;

    // Encrypt the fileUrl before saving to database
    const encryptedFileUrl = encryptUrl(fileUrl);

    const message = await Message.create({
      chatId,
      senderId,
      type: "media",
      replyTo,
      metadata: {
        subtype: "image",
        fileUrl: encryptedFileUrl,
        fileName: req.file.originalname,
        fileSize: formatFileSize(req.file.size),
        caption: caption || null,
      },
    });

    await updateLastMessage(chatId, message);
    const populated = await message.populate("senderId", "name email avatar module designation");
    await populated.populate("replyTo", "content type senderId metadata");
    
    // Decrypt fileUrl for response
    const decryptedFileUrl = decryptUrl(encryptedFileUrl);
    
    const msgObj = {
      ...populated.toObject(),
      messageType: "image",
      fileUrl: decryptedFileUrl,
      fileName: req.file.originalname,
      fileSize: formatFileSize(req.file.size),
      caption: caption || null,
      replyTo: buildReplyPreview(populated.replyTo),
      reactions: [],
      seenBy: [],
      poll: null,
    };

    const io = req.app.get("io");
    if (io) {
      io.to(chatId).emit("receive_message", msgObj);
    }

    res.status(201).json({ success: true, data: msgObj });
  } catch (err) {
    console.error("uploadImage error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/upload/file
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });

    const { chatId, senderId } = req.body;
    const authUserId = req.user?.id;
    const replyTo = parseReplyToId(req.body.replyTo);
    if (!chatId || !senderId) {
      return res
        .status(400)
        .json({ success: false, error: "chatId and senderId required" });
    }

    if (!authUserId || String(authUserId) !== String(senderId)) {
      return res.status(403).json({ success: false, error: "Sender mismatch" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat)
      return res.status(404).json({ success: false, error: "Chat not found" });

    const isMember = await ChatMember.findOne({ chatId, userId: senderId, isActive: { $ne: false } }).lean();
    if (!isMember)
      return res.status(403).json({ success: false, error: "You are no longer an active member" });

    const fileUrl = await uploadToS3({ file: req.file, folder: "files", dispositionType: "attachment" });
    const { caption } = req.body;

    // Encrypt the fileUrl before saving to database
    const encryptedFileUrl = encryptUrl(fileUrl);

    const message = await Message.create({
      chatId,
      senderId,
      type: "media",
      replyTo,
      metadata: {
        subtype: "file",
        fileUrl: encryptedFileUrl,
        fileName: req.file.originalname,
        fileSize: formatFileSize(req.file.size),
        caption: caption || null,
      },
    });

    await updateLastMessage(chatId, message);
    const populated = await message.populate("senderId", "name email avatar module designation");
    await populated.populate("replyTo", "content type senderId metadata");
    
    // Decrypt fileUrl for response
    const decryptedFileUrl = decryptUrl(encryptedFileUrl);
    
    const msgObj = {
      ...populated.toObject(),
      messageType: "file",
      fileUrl: decryptedFileUrl,
      fileName: req.file.originalname,
      fileSize: formatFileSize(req.file.size),
      caption: caption || null,
      replyTo: buildReplyPreview(populated.replyTo),
      reactions: [],
      seenBy: [],
      poll: null,
    };

    const io = req.app.get("io");
    if (io) {
      io.to(chatId).emit("receive_message", msgObj);
    }

    res.status(201).json({ success: true, data: msgObj });
  } catch (err) {
    console.error("uploadFile error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/upload/voice
exports.uploadVoice = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ success: false, error: "No audio uploaded" });

    const { chatId, senderId, duration } = req.body;
    const authUserId = req.user?.id;
    const replyTo = parseReplyToId(req.body.replyTo);
    if (!chatId || !senderId) {
      return res
        .status(400)
        .json({ success: false, error: "chatId and senderId required" });
    }

    if (!authUserId || String(authUserId) !== String(senderId)) {
      return res.status(403).json({ success: false, error: "Sender mismatch" });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat)
      return res.status(404).json({ success: false, error: "Chat not found" });

    const isMember = await ChatMember.findOne({ chatId, userId: senderId, isActive: { $ne: false } }).lean();
    if (!isMember)
      return res.status(403).json({ success: false, error: "You are no longer an active member" });

    const voiceUrl = await uploadToS3({ file: req.file, folder: "voice", dispositionType: "inline" });

    // Encrypt the voiceUrl before saving to database
    const encryptedVoiceUrl = encryptUrl(voiceUrl);

    const message = await Message.create({
      chatId,
      senderId,
      type: "media",
      replyTo,
      metadata: {
        subtype: "voice",
        voiceUrl: encryptedVoiceUrl,
        voiceDuration: duration ? parseFloat(duration) : null,
      },
    });

    await updateLastMessage(chatId, message);
    const populated = await message.populate("senderId", "name email avatar module designation");
    await populated.populate("replyTo", "content type senderId metadata");
    
    // Decrypt voiceUrl for response
    const decryptedVoiceUrl = decryptUrl(encryptedVoiceUrl);
    
    const msgObj = {
      ...populated.toObject(),
      messageType: "voice",
      voiceUrl: decryptedVoiceUrl,
      voiceDuration: duration ? parseFloat(duration) : null,
      replyTo: buildReplyPreview(populated.replyTo),
      reactions: [],
      seenBy: [],
      poll: null,
    };

    const io = req.app.get("io");
    if (io) {
      io.to(chatId).emit("receive_message", msgObj);
    }

    res.status(201).json({ success: true, data: msgObj });
  } catch (err) {
    console.error("uploadVoice error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
