const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const reactionController = require("../controllers/reactionController");

router.use(verifyToken);

router.post("/", reactionController.addReaction);
router.delete("/", reactionController.removeReaction);

module.exports = router;
