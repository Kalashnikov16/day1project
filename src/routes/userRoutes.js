const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/auth");
const sseManager = require("../utils/sseManager");
const jwt = require("jsonwebtoken");

// ==========================================
// PUBLIC & AUTHENTICATION ENDPOINTS
// ==========================================
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/refresh", userController.refreshToken);
router.post("/logout", userController.logout);

// Public Password Reset & OTP Endpoints
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password", userController.resetPassword);
router.post("/verify-otp", userController.verifyOtp);

// ==========================================
// SSE CONNECTION ENDPOINT
// ==========================================
router.get("/events", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).end();

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const userId = decoded.userId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseManager.addClient(userId, res);

    req.on("close", () => {
      sseManager.removeClient(userId);
    });
  } catch (err) {
    res.status(403).end();
  }
});

// 3. PRODUCT ENDPOINTS

router.get("/products", authMiddleware, userController.getProducts);
router.post("/products", authMiddleware, userController.createProduct);
router.patch("/products/:id", authMiddleware, userController.updateProduct);
router.delete("/products/:id", authMiddleware, userController.deleteProduct);

// ==========================================
// UNIFIED PROTECTED USER ENDPOINTS
// (Role verification handled inside controller)
// ==========================================
// Handles both "View My Details" (?scope=me) and "View All Details" (User Directory)
router.get("/users", authMiddleware, userController.getUsersOrProfile);

// Single route handles lookup by ID (Admins can view anyone, Users can view self)
router.get("/users/:id", authMiddleware, userController.getUserById);

// ==========================================
// ACCESS REQUEST ENDPOINTS
// ==========================================
router.post("/requests", authMiddleware, userController.createAccessRequest);
router.get(
  "/requests/manage",
  authMiddleware,
  userController.getAccessRequests,
);
router.patch(
  "/requests/:id",
  authMiddleware,
  userController.handleAccessRequest,
);

// Export router
module.exports = router;
