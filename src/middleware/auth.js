const jwt = require("jsonwebtoken");
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

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  try {
    // 1. Verify token signature and extract minimal identity (userId)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. 🟢 Query the database for user's role and permissions into constants
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    // 3. Extract role and flatten permissions into constants
    const role = user.userRoles?.[0]?.role?.name || "User";
    const permissionsSet = new Set();
    user.userRoles.forEach((ur) => {
      ur.role.permissions.forEach((rp) => {
        permissionsSet.add(rp.permission.name);
      });
    });

    // 4. Attach fresh database-backed context to req.user
    req.user = {
      userId: user.id,
      role,
      permissions: Array.from(permissionsSet),
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};
