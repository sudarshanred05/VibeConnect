const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const c = require("../controllers/chatController");
const { verifyToken } = require("../middleware/auth");

// All routes require authentication
router.use(verifyToken);

router.get("/", c.getChats);
router.post("/reply-privately/:messageId", c.replyPrivately);
router.get("/:id", c.getChatById);
router.post(
  "/",
  [
    body("members").isArray({ min: 1 }).withMessage("Members array required"),
    body("createdBy").notEmpty().withMessage("createdBy required"),
  ],
  c.createChat,
);
router.delete("/:id", c.deleteOrLeaveChat);
router.delete("/:id/group", c.deleteGroupChat);
router.post("/:id/members", c.addMember);
router.delete("/:id/members/:userId", c.removeMember);

module.exports = router;
