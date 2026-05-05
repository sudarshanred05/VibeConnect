// routes/users.js
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const c = require("../controllers/userController");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

router.get("/modules", c.getModules); // Must come before /:id
router.get("/", c.getUsers);
router.get("/:id", c.getUserById);
router.post(
  "/",
  [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name required")
      .isLength({ max: 100 }),
    body("email")
      .isEmail()
      .withMessage("Valid email required")
      .normalizeEmail(),
    body("module").notEmpty().withMessage("Module required"),
  ],
  c.createUser,
);
router.patch("/:id/status", c.updateStatus);

module.exports = router;
