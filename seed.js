require("dotenv").config();
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "day1project",
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

async function seedDatabase() {
  try {
    console.log("Hashing passwords...");
    // The '10' is the salt rounds—the standard for secure bcrypt hashing
    const userPassword = await bcrypt.hash("password123", 10);
    const adminPassword = await bcrypt.hash("admin123", 10);

    console.log("Inserting test users...");
    await prisma.user.createMany({
      data: [
        {
          name: "Standard User",
          email: "user@test.com",
          password: userPassword,
          role: "User",
        },
        {
          name: "Admin User",
          email: "admin@test.com",
          password: adminPassword,
          role: "Admin",
        },
      ],
    });

    console.log("Database successfully seeded!");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedDatabase();
