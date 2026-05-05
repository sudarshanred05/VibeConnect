const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const c = require("../controllers/messageController");
const { verifyToken } = require("../middleware/auth");

// All routes require authentication
router.use(verifyToken);

router.get("/", c.getMessages);
router.post(
  "/",
  [
    body("chatId").notEmpty(),
    body("senderId").notEmpty(),
    body("type").optional().isIn(["text", "media", "poll", "system"]),
    body("content").optional().isLength({ max: 10000 }),
  ],
  c.sendMessage,
);
router.post(
  "/poll",
  [
    body("chatId").notEmpty(),
    body("senderId").notEmpty(),
    body("question").notEmpty().isLength({ max: 500 }),
    body("options").isArray({ min: 2, max: 10 }),
  ],
  c.createPoll,
);
router.patch("/:id", c.editMessage);
router.delete("/:id", c.deleteMessage);

module.exports = router;
