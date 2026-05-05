const express = require("express");
const { body } = require("express-validator");
const corpusController = require("../controllers/corpusController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

router.use(verifyToken);

router.get("/summary", corpusController.getSummary);
router.post(
  "/feedback",
  [
    body("rating").isIn(["positive", "negative"]).withMessage("rating must be positive or negative"),
    body("comment").optional().isLength({ max: 1000 }),
  ],
  corpusController.submitFeedback,
);

router.use(authorizeRoles("admin"));

router.post("/upload", upload.file.single("file"), corpusController.uploadCorpus);
router.post("/manual", corpusController.createManualCorpus);
router.post("/reindex-seed", corpusController.reindexSeed);
router.get("/analytics", corpusController.getAnalytics);

module.exports = router;
