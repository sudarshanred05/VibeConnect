const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const pollController = require("../controllers/pollController");

router.use(verifyToken);

router.post("/vote", pollController.votePoll);

module.exports = router;
