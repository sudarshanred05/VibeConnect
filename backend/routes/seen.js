const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const seenController = require("../controllers/seenController");

router.use(verifyToken);

router.post("/", seenController.markAsSeen);
router.post("/batch", seenController.markChatAsSeen);

module.exports = router;
