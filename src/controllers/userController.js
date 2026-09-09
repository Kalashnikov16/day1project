require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../prisma/dev.db");
const db = new Database(dbPath);
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
});
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
