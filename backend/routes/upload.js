const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const c = require("../controllers/uploadController");
const { verifyToken } = require("../middleware/auth");

// Public media proxy for rendering/downloading private S3 objects
router.get("/media", c.streamMedia);
router.get("/media/*", c.streamMedia);

// All routes require authentication
router.use(verifyToken);

router.post("/image", upload.image.single("file"), c.uploadImage);
router.post("/file", upload.file.single("file"), c.uploadFile);
router.post("/voice", upload.voice.single("audio"), c.uploadVoice);

module.exports = router;
