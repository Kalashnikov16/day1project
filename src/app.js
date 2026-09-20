const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const morgan = require("morgan");
const authMiddleware = require("./middleware/auth");
const userController = require("./controllers/userController");

const app = express();

app.use(morgan("dev"));
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads
app.use("/api/users", userRoutes);
// Open route: Anyone can try to log in
app.post("/api/login", userController.login);

// Protected route: Requires valid token to view all users
app.get("/api/users", authMiddleware, userController.getAllUsers);

// Protected route: Requires valid token to view own details
app.get("/api/users/me", authMiddleware, userController.getMe);

module.exports = app;
