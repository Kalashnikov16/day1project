require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");
const mariadb = require("mariadb");
const {
  validatePermissionDependencies,
  findMatchingPermissionRole,
} = require("../utils/rbacValidator");

const pool = mariadb.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "day1project",
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

const ensureRoleManager = (req, res) => {
  const perms = req.user?.permissions || [];
  if (req.user?.role !== "SuperAdmin" && !perms.includes("roles:manage")) {
    res.status(403).json({ error: "Super Admin permission required." });
    return false;
  }
  return true;
};

// GET /api/permissions
exports.getAllPermissions = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: { id: "asc" },
    });
    return res.status(200).json(permissions);
  } catch (err) {
    console.error("Get permissions error:", err);
    return res.status(500).json({ error: "Failed to load permissions" });
  }
};

// GET /api/roles (includes permissions and assigned user count)
exports.getAllRoles = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
      orderBy: { id: "asc" },
    });

    const formatted = roles.map((r) => ({
      id: r.id,
      name: r.name,
      userCount: r._count.userRoles,
      permissions: r.permissions.map((rp) => rp.permission),
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error("Get roles error:", err);
    return res.status(500).json({ error: "Failed to fetch roles" });
  }
};

// POST /api/roles
// Body: { name, permissionIds, confirmDuplicatePermissions }
exports.createRole = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;

  try {
    const rawName = (req.body.name || "").trim();
    const permissionIds = Array.isArray(req.body.permissionIds)
      ? [...new Set(req.body.permissionIds.map(Number))]
      : [];
    const confirmDuplicatePermissions = Boolean(
      req.body.confirmDuplicatePermissions,
    );

    if (!rawName) {
      return res.status(400).json({ error: "Role name is required." });
    }
    if (permissionIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Select at least one permission for the role." });
    }

    // 1. Block duplicate role names (case-insensitive check)
    const allRoles = await prisma.role.findMany({
      include: { permissions: true },
    });
    const duplicateNameRole = allRoles.find(
      (r) => r.name.toLowerCase() === rawName.toLowerCase(),
    );
    if (duplicateNameRole) {
      return res.status(409).json({
        error: `A role named "${duplicateNameRole.name}" already exists. Role names must be unique.`,
      });
    }

    // 2. Validate permission IDs exist and check dependency rules
    const dbPermissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (dbPermissions.length !== permissionIds.length) {
      return res
        .status(400)
        .json({ error: "One or more selected permissions are invalid." });
    }

    const depCheck = validatePermissionDependencies(
      dbPermissions.map((p) => p.name),
    );
    if (!depCheck.valid) {
      return res.status(400).json({ error: depCheck.error });
    }

    // 3. Check if selected permission set matches an existing role
    const matchingRole = findMatchingPermissionRole(allRoles, permissionIds);
    if (matchingRole && !confirmDuplicatePermissions) {
      return res.status(200).json({
        requiresConfirmation: true,
        matchingRoleName: matchingRole.name,
        message: `These exact permissions already match the "${matchingRole.name}" role. Do you want to continue creating this role with a different name or abort?`,
      });
    }

    // 4. Create Role and RolePermission rows atomically
    const created = await prisma.$transaction(async (tx) => {
      const newRole = await tx.role.create({
        data: { name: rawName },
      });

      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: newRole.id,
          permissionId,
        })),
      });

      return tx.role.findUnique({
        where: { id: newRole.id },
        include: { permissions: { include: { permission: true } } },
      });
    });

    return res.status(201).json({
      message: `Role "${created.name}" created successfully.`,
      role: created,
    });
  } catch (err) {
    console.error("Create role error:", err);
    return res.status(500).json({ error: "Failed to create role" });
  }
};

// GET /api/roles/:id/users (lists users currently assigned to a role)
exports.getUsersByRole = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;
  try {
    const roleId = parseInt(req.params.id, 10);
    const assignments = await prisma.userRole.findMany({
      where: { roleId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return res.status(200).json(assignments.map((a) => a.user));
  } catch (err) {
    console.error("Get users by role error:", err);
    return res.status(500).json({ error: "Failed to fetch users for role" });
  }
};

// POST /api/roles/:id/reassign-and-delete
// Body: { replacementRoleId } (optional if 0 users assigned)
exports.reassignAndDeleteRole = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;

  try {
    const roleId = parseInt(req.params.id, 10);
    const replacementRoleId = req.body.replacementRoleId
      ? parseInt(req.body.replacementRoleId, 10)
      : null;

    const targetRole = await prisma.role.findUnique({ where: { id: roleId } });
    if (!targetRole) {
      return res.status(404).json({ error: "Role not found." });
    }
    if (targetRole.name === "SuperAdmin") {
      return res
        .status(400)
        .json({ error: "SuperAdmin role cannot be deleted." });
    }

    const assignedUsers = await prisma.userRole.findMany({
      where: { roleId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // If users hold this role and no valid replacementRoleId was provided, block & inform UI
    if (assignedUsers.length > 0 && !replacementRoleId) {
      return res.status(409).json({
        hasAssignedUsers: true,
        assignedCount: assignedUsers.length,
        assignedUsers: assignedUsers.map((a) => a.user),
        message: `There are currently ${assignedUsers.length} people with this role. Please assign them a different role to proceed.`,
      });
    }

    if (replacementRoleId === roleId) {
      return res
        .status(400)
        .json({
          error: "Replacement role must be different from the deleted role.",
        });
    }

    await prisma.$transaction(async (tx) => {
      if (assignedUsers.length > 0) {
        const replacementRole = await tx.role.findUnique({
          where: { id: replacementRoleId },
        });
        if (!replacementRole) {
          throw new Error("REPLACEMENT_NOT_FOUND");
        }

        for (const assignment of assignedUsers) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId: assignment.userId,
                roleId: replacementRoleId,
              },
            },
            update: {},
            create: {
              userId: assignment.userId,
              roleId: replacementRoleId,
            },
          });
        }
      }

      await tx.userRole.deleteMany({ where: { roleId } });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.role.delete({ where: { id: roleId } });
    });

    return res.status(200).json({
      message: `Role "${targetRole.name}" deleted successfully.`,
    });
  } catch (err) {
    if (err.message === "REPLACEMENT_NOT_FOUND") {
      return res
        .status(400)
        .json({ error: "Selected replacement role not found." });
    }
    console.error("Delete role error:", err);
    return res.status(500).json({ error: "Failed to delete role" });
  }
};

// POST /api/users/assign-role
// Body: { roleId, userIds: [1, 2, 3] }
exports.assignRoleToUsers = async (req, res) => {
  if (!ensureRoleManager(req, res)) return;

  try {
    const roleId = parseInt(req.body.roleId, 10);
    const userIds = Array.isArray(req.body.userIds)
      ? [...new Set(req.body.userIds.map(Number))]
      : [];

    if (!roleId || userIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Select a role and at least one user." });
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(404).json({ error: "Role not found." });
    }

    await prisma.$transaction(async (tx) => {
      for (const uid of userIds) {
        await tx.userRole.deleteMany({ where: { userId: uid } });
        await tx.userRole.create({
          data: { userId: uid, roleId },
        });
      }
    });

    return res.status(200).json({
      message: `Assigned role "${role.name}" to ${userIds.length} user(s).`,
    });
  } catch (err) {
    console.error("Assign role error:", err);
    return res.status(500).json({ error: "Failed to assign role to users" });
  }
};
