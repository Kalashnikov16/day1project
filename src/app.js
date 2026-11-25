const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const morgan = require("morgan");
const authMiddleware = require("./middleware/auth");
const userController = require("./controllers/userController");
const cookieParser = require("cookie-parser");
const app = express();

// Must allow credentials so the browser accepts/sends HttpOnly cookies
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(morgan("dev"));
//app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads
app.use(cookieParser());
app.use("/api", userRoutes);
app.use("/api", roleRoutes);
// Open route: Anyone can try to log in
app.post("/api/login", userController.login);
app.post("/api/register", userController.register);
// Protected route: Requires valid token to view all users
app.get("/api/users", authMiddleware, userController.getAllUsers);

// Protected route: Requires valid token to view own details
app.get("/api/users/me", authMiddleware, userController.getMe);
app.post("/api/refresh", userController.refreshToken);
app.post("/api/logout", userController.logout);

module.exports = app;
