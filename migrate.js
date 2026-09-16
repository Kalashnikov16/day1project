require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");

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

const filePath = path.join(__dirname, "data/users.json");

async function migrateData() {
  try {
    console.log("Reading users from JSON file...");
    const rawData = await fs.readFile(filePath, "utf-8");
    const users = JSON.parse(rawData);

    console.log(`Found ${users.length} users. Migrating to MySQL...`);

    for (const user of users) {
      await prisma.user.create({
        data: {
          name: user.name,
          role: user.role || "User",
          createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
        },
      });
    }

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    // Always disconnect the client and close the pool
    await prisma.$disconnect();
    await pool.end();
  }
}

migrateData();
