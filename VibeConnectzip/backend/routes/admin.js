const express = require("express");
const { body, param } = require("express-validator");
const adminController = require("../controllers/adminController");
const reportController = require("../controllers/reportController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken);
router.use(authorizeRoles("admin"));

router.get("/pending-users", adminController.getPendingUsers);

router.post(
  "/approve-user",
  [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("role").optional().isIn(["employee", "manager", "hr", "admin"]),
    body("designation").optional().isString().withMessage("Designation must be a string"),
    body("module").optional(),
    body("managerId").optional(),
  ],
  adminController.approveUser,
);

router.post(
  "/reject-user",
  [body("userId").notEmpty().withMessage("User ID is required")],
  adminController.rejectUser,
);

router.get("/users", adminController.getAllUsers);
router.get("/designations", adminController.getDesignations);
router.get("/org-tree", adminController.getOrgTree);

router.get("/managers", adminController.getManagers);

router.put(
  "/users/role",
  [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("role").optional().isIn(["employee", "manager", "hr", "admin"]),
    body("designation").optional().isString().withMessage("Designation must be a string"),
    body("managerId").optional(),
  ],
  adminController.updateUserRole,
);

router.delete("/users/:userId", adminController.deleteUser);

router.get("/reports/pending", reportController.adminListPending);
router.post(
  "/reports/:id/approve",
  [param("id").isMongoId().withMessage("Invalid report id")],
  reportController.adminApproveReport,
);
router.post(
  "/reports/:id/reject",
  [param("id").isMongoId().withMessage("Invalid report id")],
  reportController.adminRejectReport,
);
router.post(
  "/report-actions/:id/approve",
  [param("id").isMongoId().withMessage("Invalid action id")],
  reportController.adminApproveRemoval,
);
router.post(
  "/report-actions/:id/reject",
  [param("id").isMongoId().withMessage("Invalid action id")],
  reportController.adminRejectRemoval,
);

module.exports = router;
