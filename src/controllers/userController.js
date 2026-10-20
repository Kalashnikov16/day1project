require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "day1project",
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

// GET all users
exports.getAllUsers = async (req, res) => {
  console.log("hey");
  try {
    const users = await prisma.user.findMany();
    // 🟢 Ensure status is 200 and json is sent
    return res.status(200).json(users);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to fetch users from database" });
  }
};

// Cookie configuration helper
const COOKIE_OPTIONS = {
  httpOnly: true, // Blocks JavaScript (XSS protection)
  secure: process.env.NODE_ENV === "production", // true in production (HTTPS)
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// LOGIN endpoint
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // 1. Generate 30s Access Token and 7d Refresh Token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: "30s",
    },
  );
  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" },
  );

  // 2. Save Refresh Token ONLY to Database
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshToken },
  });

  // Set Refresh Token as an HttpOnly Cookie
  res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

  // 3. Send ONLY Access Token to Frontend
  res.status(200).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
};

// GET my details
exports.getMe = async (req, res) => {
  try {
    const myDetails = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!myDetails) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure status is 200 and json is sent
    return res.status(200).json(myDetails);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
};

// Register New User
exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    res
      .status(201)
      .json({ message: "Registration successful! Please log in." });
  } catch (error) {
    res.status(500).json({ error: "Failed to register user" });
  }
};

// REFRESH endpoint - Implements Refresh Token Rotation
exports.refreshToken = async (req, res) => {
  // Read cookie sent automatically by browser
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token missing from cookie" });
  }

  try {
    // 1. Verify mathematically
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // 2. Check Database whitelist match
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      return res
        .status(403)
        .json({ error: "Invalid or revoked refresh token" });
    }

    // 3. Mint NEW Access Token & NEW Rotated Refresh Token
    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30s" },
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" },
    );

    // 4. Update Database with new rotated refresh token
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    // 5. Set NEW Refresh Token in HttpOnly Cookie
    res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS);

    // 6. Return ONLY new Access Token in JSON
    return res.status(200).json({ token: newAccessToken });
  } catch (error) {
    return res
      .status(403)
      .json({ error: "Session expired. Please log in again." });
  }
};

// LOGOUT endpoint
exports.logout = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.decode(refreshToken);
      if (decoded && decoded.userId) {
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { refreshToken: null },
        });
      }
    } catch (err) {
      console.error("Logout DB clear error:", err);
    }
  }

  // Clear Cookie
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.status(200).json({ message: "Logged out successfully" });
};

// GET a specific user by ID (Admin only)
exports.getUserById = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true }, // Exclude passwords
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
};
