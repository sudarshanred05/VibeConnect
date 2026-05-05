const express = require("express");
const router = express.Router();
const { param, body } = require("express-validator");
const { verifyToken } = require("../middleware/auth");
const reportController = require("../controllers/reportController");

const validateObjectId = param("id").isMongoId().withMessage("Invalid message ID");

router.use(verifyToken);

// Report a message
router.post("/:id/report", validateObjectId, reportController.reportMessage);

// Report a user in a chat (via message)
router.post(
  "/user/:userId/chat/:chatId",
  [
    param("userId").isMongoId().withMessage("Invalid user ID"),
    param("chatId").isMongoId().withMessage("Invalid chat ID"),
    body("messageId").optional().isMongoId().withMessage("Invalid message ID"),
    body("reason").optional().isString().trim().isLength({ max: 500 }).withMessage("Reason must be under 500 characters"),
  ],
  reportController.reportUserInChat
);

module.exports = router;
