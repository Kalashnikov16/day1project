require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 1. Create a connection pool using environment variables
const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "day1project",
  connectionLimit: 5,
});

// 2. Wrap the pool in the adapter and initialize Prisma
const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

// GET all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users from database" });
  }
};

// POST a new user
exports.createUser = async (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const newUser = await prisma.user.create({
      data: {
        name,
        role: role || "User",
      },
    });

    res
      .status(201)
      .json({ message: "User created successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
};

// PUT update a user
exports.updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, role } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, role },
    });

    res
      .status(200)
      .json({ message: "User updated successfully", user: updatedUser });
  } catch (error) {
    // Prisma throws an error if the record to update doesn't exist
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to update user" });
  }
};

// DELETE a user
exports.deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// LOGIN endpoint
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  console.log(password);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
  res.json({ token, user: { id: user.id, name: user.name } });
};

// GET my details
exports.getMe = async (req, res) => {
  try {
    const myDetails = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    res.json(myDetails);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details" });
  }
};

// Register New User
exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // 1. Check if the email already exists to prevent database constraint crashes
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // 2. Hash the password with a cost factor of 10
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Save the new user to MySQL
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // role defaults to "User" based on your Prisma schema
      },
    });

    // 4. Generate a token to auto-login the new user immediately
    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res
      .status(201)
      .json({ token, user: { id: newUser.id, name: newUser.name } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to register user" });
  }
};
