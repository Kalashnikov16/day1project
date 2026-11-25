const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const roleController = require("../controllers/roleController");

router.get("/permissions", auth, roleController.getAllPermissions);
router.get("/roles", auth, roleController.getAllRoles);
router.post("/roles", auth, roleController.createRole);
router.get("/roles/:id/users", auth, roleController.getUsersByRole);
router.post(
  "/roles/:id/reassign-and-delete",
  auth,
  roleController.reassignAndDeleteRole,
);
router.post("/users/assign-role", auth, roleController.assignRoleToUsers);

module.exports = router;
