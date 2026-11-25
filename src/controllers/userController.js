require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const sseManager = require("../utils/sseManager");

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "day1project",
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

// ==========================================
// HELPERS FOR PERMISSION RESOLUTION
// ==========================================
const getUserDetailsWithPermissions = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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

  if (!user) return null;

  const role = user.userRoles?.[0]?.role?.name || "User";
  const permissionsSet = new Set();
  user.userRoles.forEach((ur) => {
    ur.role.permissions.forEach((rp) => {
      permissionsSet.add(rp.permission.name);
    });
  });

  return {
    ...user,
    role,
    permissions: Array.from(permissionsSet),
  };
};

const getUserDetailsWithPermissionsByEmail = async (email) => {
  const user = await prisma.user.findUnique({
    where: { email },
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

  if (!user) return null;

  const role = user.userRoles?.[0]?.role?.name || "User";
  const permissionsSet = new Set();
  user.userRoles.forEach((ur) => {
    ur.role.permissions.forEach((rp) => {
      permissionsSet.add(rp.permission.name);
    });
  });

  return {
    ...user,
    role,
    permissions: Array.from(permissionsSet),
  };
};

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ==========================================
// AUTHENTICATION CONTROLLERS
// ==========================================

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const fullUser = await getUserDetailsWithPermissionsByEmail(email);

    if (!fullUser) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!fullUser.isVerified) {
      return res.status(403).json({
        error: "Account not verified. Please complete OTP verification.",
        requiresVerification: true,
        email,
      });
    }

    const isMatch = await bcrypt.compare(password, fullUser.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: fullUser.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30s" },
    );
    const refreshToken = jwt.sign(
      { userId: fullUser.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" },
    );

    const decodedRefresh = jwt.decode(refreshToken);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        iat: new Date(decodedRefresh.iat * 1000),
        exp: new Date(decodedRefresh.exp * 1000),
        userId: fullUser.id,
      },
    });

    res.cookie("refreshToken", refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      token,
      user: {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
        permissions: fullUser.permissions,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.register = async (req, res) => {
  const { name, email, password } = req.body;
  const generateOTP = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    let defaultRole = await prisma.role.findUnique({ where: { name: "User" } });
    if (!defaultRole) {
      defaultRole = await prisma.role.create({ data: { name: "User" } });
    }

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        isVerified: false,
        otp,
        otpExpiry,
        userRoles: {
          create: { roleId: defaultRole.id },
        },
      },
    });

    console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);

    return res.status(201).json({
      message:
        "Registration successful! Please check your email for the verification OTP.",
      requiresVerification: true,
      email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Failed to register user" });
  }
};

exports.refreshToken = async (req, res) => {
  const incomingToken = req.cookies.refreshToken;
  if (!incomingToken) {
    return res.status(401).json({ error: "Refresh token missing from cookie" });
  }

  try {
    jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);

    const storedTokenRecord = await prisma.refreshToken.findUnique({
      where: { token: incomingToken },
      include: { user: true },
    });

    if (!storedTokenRecord) {
      return res
        .status(403)
        .json({ error: "Invalid or revoked refresh token" });
    }

    const fullUser = await getUserDetailsWithPermissions(
      storedTokenRecord.userId,
    );
    const newAccessToken = jwt.sign(
      {
        userId: fullUser.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "30s" },
    );

    const newRefreshToken = jwt.sign(
      { userId: fullUser.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" },
    );

    const decodedNewRefresh = jwt.decode(newRefreshToken);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: storedTokenRecord.id } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          iat: new Date(decodedNewRefresh.iat * 1000),
          exp: new Date(decodedNewRefresh.exp * 1000),
          userId: fullUser.id,
        },
      }),
    ]);

    res.cookie("refreshToken", newRefreshToken, COOKIE_OPTIONS);
    return res.status(200).json({ token: newAccessToken });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res
      .status(403)
      .json({ error: "Session expired. Please log in again." });
  }
};

exports.logout = async (req, res) => {
  const incomingToken = req.cookies.refreshToken;
  if (incomingToken) {
    try {
      await prisma.refreshToken.deleteMany({ where: { token: incomingToken } });
    } catch (err) {
      console.error("Logout DB clear error:", err);
    }
  }
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  return res.status(200).json({ message: "Logged out successfully" });
};

// ==========================================
// USER PROFILE & DIRECTORY CONTROLLERS
// ==========================================

// Restored: getAllUsers endpoint handler
exports.getAllUsers = async (req, res) => {
  try {
    const permissions = req.user.permissions || [];

    if (!permissions.includes("users:list_directory")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const users = await prisma.user.findMany({
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    const formattedUsers = users.map((u) => {
      const roleName = u.userRoles?.[0]?.role?.name || "User";
      const canReadAny = permissions.includes("users:read_any");

      return {
        id: u.id,
        name: u.name,
        role: roleName,
        createdAt: u.createdAt,
        ...(canReadAny && { email: u.email }), // Scrub email if lacking read_any permission
      };
    });

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Get all users error:", error);
    return res
      .status(500)
      .json({ error: "Failed to fetch users from database" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const permissions = req.user.permissions || [];
    if (!permissions.includes("users:read_self")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const fullUser = await getUserDetailsWithPermissions(req.user.userId);
    if (!fullUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      id: fullUser.id,
      name: fullUser.name,
      email: fullUser.email,
      role: fullUser.role,
      createdAt: fullUser.createdAt,
    });
  } catch (error) {
    console.error("Get me error:", error);
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
};

exports.getUsersOrProfile = async (req, res) => {
  try {
    const { userId, permissions = [] } = req.user;
    const { scope } = req.query;

    if (scope === "me") {
      if (!permissions.includes("users:read_self")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing permission." });
      }

      const fullUser = await getUserDetailsWithPermissions(userId);
      if (!fullUser) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
      });
    }

    if (!permissions.includes("users:list_directory")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const users = await prisma.user.findMany({
      include: { userRoles: { include: { role: true } } },
    });

    const formattedUsers = users.map((u) => {
      const userRole = u.userRoles?.[0]?.role?.name || "User";
      const canReadAny = permissions.includes("users:read_any");

      return {
        id: u.id,
        name: u.name,
        role: userRole,
        ...(canReadAny && { email: u.email }),
      };
    });

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Get users or profile error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const { userId, permissions = [] } = req.user;

    const canReadAny = permissions.includes("users:read_any");
    const isSelf = userId === targetUserId;

    if (!canReadAny && !isSelf) {
      return res
        .status(403)
        .json({ error: "Access denied. You can only view your own profile." });
    }

    const fullUser = await getUserDetailsWithPermissions(targetUserId);
    if (!fullUser) return res.status(404).json({ error: "User not found" });

    return res.status(200).json({
      id: fullUser.id,
      name: fullUser.name,
      email: fullUser.email,
      role: fullUser.role,
    });
  } catch (error) {
    console.error("Get user by ID error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ==========================================
// ACCESS REQUESTS & UTILS
// ==========================================

exports.createAccessRequest = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { roleRequested } = req.body;

    const existing = await prisma.accessRequest.findFirst({
      where: { userId, status: "PENDING" },
    });

    if (existing) {
      return res
        .status(400)
        .json({ error: "You already have a pending request." });
    }

    const newRequest = await prisma.accessRequest.create({
      data: {
        userId,
        roleRequested: roleRequested || "Admin",
        status: "PENDING",
      },
    });

    return res
      .status(201)
      .json({ message: "Request submitted successfully", newRequest });
  } catch (error) {
    return res.status(500).json({ error: "Failed to submit request" });
  }
};

exports.getPendingRequests = async (req, res) => {
  try {
    if (!req.user.permissions?.includes("requests:manage")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const requests = await prisma.accessRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return res.status(200).json(requests);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch requests" });
  }
};

exports.getAccessRequests = async (req, res) => {
  try {
    if (!req.user.permissions?.includes("requests:manage")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const requests = await prisma.accessRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true },
    });

    return res.status(200).json(requests);
  } catch (error) {
    console.error("Get requests error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.handleAccessRequest = async (req, res) => {
  try {
    if (!req.user.permissions?.includes("requests:manage")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const requestId = parseInt(req.params.id);
    const { status } = req.body;

    const request = await prisma.accessRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return res.status(404).json({ error: "Request not found" });

    await prisma.accessRequest.update({
      where: { id: requestId },
      data: { status },
    });

    if (status === "APPROVED") {
      const targetRole = await prisma.role.findUnique({
        where: { name: request.roleRequested },
      });
      if (targetRole) {
        await prisma.userRole.deleteMany({ where: { userId: request.userId } });
        await prisma.userRole.create({
          data: { userId: request.userId, roleId: targetRole.id },
        });
      }
      sseManager.notifyUser(request.userId, { type: "ROLE_APPROVED" });
    }

    return res
      .status(200)
      .json({ message: `Request ${status.toLowerCase()} successfully` });
  } catch (error) {
    console.error("Handle request error:", error);
    return res.status(500).json({ error: "Failed to process request" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    console.log(
      `[DEV ONLY] Reset Link: http://localhost:5173/reset-password?token=${resetToken}`,
    );

    return res.status(200).json({
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "Token and new password are required." });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gte: new Date() },
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired password reset token." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    return res
      .status(200)
      .json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isVerified) {
      return res
        .status(400)
        .json({ error: "Invalid request or account already verified." });
    }

    if (user.otp !== otp || new Date() > user.otpExpiry) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otp: null,
        otpExpiry: null,
      },
    });

    return res
      .status(200)
      .json({ message: "Account verified successfully! You can now log in." });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
};

// ==========================================
// PRODUCT CONTROLLERS
// ==========================================

exports.getProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.status(200).json(products);
  } catch (error) {
    console.error("Get products error:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
};

exports.createProduct = async (req, res) => {
  try {
    console.log(req);
    const { userId, permissions } = req.user;
    //const permission = await prisma.
    if (!permissions.includes("products:create")) {
      return res
        .status(403)
        .json({ error: "Access denied. Missing permission." });
    }

    const { name, price } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "Name and price are required." });
    }

    // userId is automatically bound from the token and non-accessible from user input
    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ error: "Failed to create product" });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { userId, permissions, role } = req.user;
    const { name, price } = req.body;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const isOwner = product.userId === userId;
    const canUpdateAny = permissions.includes("products:update_any");
    const canUpdateOwn = permissions.includes("products:update_own") && isOwner;

    if (!canUpdateAny && !canUpdateOwn) {
      return res
        .status(403)
        .json({ error: "Access denied to update this product." });
    }

    let updateData = {};
    if (role === "Moderator") {
      // Moderator can ONLY update the price field
      if (price === undefined) {
        return res
          .status(400)
          .json({ error: "Moderators can only update the price field." });
      }
      updateData.price = parseFloat(price);
    } else {
      // Users (own) & Admins (any) can update name and price
      if (name !== undefined) updateData.name = name;
      if (price !== undefined) updateData.price = parseFloat(price);
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: { user: { select: { id: true, name: true } } },
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({ error: "Failed to update product" });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { userId, permissions } = req.user;

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const isOwner = product.userId === userId;
    const canDeleteAny = permissions.includes("products:delete_any");
    const canDeleteOwn = permissions.includes("products:delete_own") && isOwner;

    if (!canDeleteAny && !canDeleteOwn) {
      return res
        .status(403)
        .json({ error: "Access denied to delete this product." });
    }

    await prisma.product.delete({ where: { id: productId } });

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({ error: "Failed to delete product" });
  }
};
