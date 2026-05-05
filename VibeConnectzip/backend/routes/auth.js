const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  authController.register,
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  authController.login,
);

router.post("/refresh", authController.refresh);

router.post("/logout", authController.logout);

router.get("/me", verifyToken, authController.me);

module.exports = router;
