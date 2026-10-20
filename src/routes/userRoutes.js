const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/auth"); // Adjust path if needed
const requireAdmin = require("../middleware/requireAdmin"); // Point to your admin check

// Public Auth Endpoints
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/refresh", userController.refreshToken);
router.post("/logout", userController.logout);

// Protected Endpoints (Require valid Access Token in Authorization header)
router.get("/", authMiddleware, userController.getAllUsers);
router.get("/me", authMiddleware, userController.getMe);
router.get("/:id", authMiddleware, requireAdmin, userController.getUserById);
module.exports = router;
