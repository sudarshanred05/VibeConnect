const express = require("express");
const router = express.Router();
const c = require("../controllers/aiController");
const { verifyToken } = require("../middleware/auth");

// All routes require authentication
router.use(verifyToken);

router.post("/chat", c.chat);

module.exports = router;
