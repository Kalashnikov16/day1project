require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const filePath = path.join(__dirname, "data/users.json");

async function migrateData() {
  try {
    console.log("Reading users from JSON file...");

    const rawData = await fs.readFile(filePath, "utf-8");
    const users = JSON.parse(rawData);

    console.log(`Found ${users.length} users. Migrating to SQLite...`);

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
    await prisma.$disconnect();
  }
}

migrateData();
