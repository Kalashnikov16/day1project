const fs = require("fs/promises");
const path = require("path");

const filePath = path.join(__dirname, "../../data/users.json");

// Helper function to read the JSON file
async function readData() {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data || "[]");
  } catch (err) {
    if (err.code === "ENOENT") return []; // If file doesn't exist yet
    throw err;
  }
}

// Helper function to write to the JSON file
async function writeData(data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// GET all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await readData();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to read data" });
  }
};

// POST create and store a new user in the file
exports.createUser = async (req, res) => {
  try {
    const { name, role } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const users = await readData();
    const newUser = {
      id: users.length ? users[users.length - 1].id + 1 : 1,
      name,
      role: role || "User",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await writeData(users);

    res.status(201).json({ message: "Saved successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to save data" });
  }
};

// UPDATE an existing user (PUT)
exports.updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, role } = req.body;

    const users = await readData();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's data, keeping existing values if new ones aren't provided
    users[userIndex] = {
      ...users[userIndex],
      name: name || users[userIndex].name,
      role: role || users[userIndex].role,
      updatedAt: new Date().toISOString(),
    };

    await writeData(users);
    res
      .status(200)
      .json({ message: "User updated successfully", user: users[userIndex] });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
};

// DELETE a user (DELETE)
exports.deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const users = await readData();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove the user from the array
    users.splice(userIndex, 1);

    await writeData(users);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user" });
  }
};
