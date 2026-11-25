// Validates that update/delete permissions have matching read permissions
function validatePermissionDependencies(selectedPermissionNames) {
  const permSet = new Set(selectedPermissionNames);

  const hasAnyProductRead =
    permSet.has("products:read") ||
    permSet.has("products:update_any") ||
    permSet.has("products:delete_any");

  const hasProductWriteOrDelete =
    permSet.has("products:create") ||
    permSet.has("products:update_own") ||
    permSet.has("products:delete_own") ||
    permSet.has("products:update_any") ||
    permSet.has("products:delete_any");

  if (hasProductWriteOrDelete && !hasAnyProductRead) {
    return {
      valid: false,
      error:
        "You cannot select product create, update, or delete permissions without a product read permission (e.g., products:read).",
    };
  }

  const hasUserRead =
    permSet.has("users:read_self") ||
    permSet.has("users:list_directory") ||
    permSet.has("users:read_any");

  const hasUserAdminAction = permSet.has("requests:manage");
  if (hasUserAdminAction && !hasUserRead) {
    return {
      valid: false,
      error:
        "You cannot select user/request management permissions without a user read permission.",
    };
  }

  return { valid: true };
}

// Finds any existing role that has the exact same set of permissionIds
function findMatchingPermissionRole(rolesWithPermissions, requestedPermIds) {
  const targetSorted = [...new Set(requestedPermIds.map(Number))].sort(
    (a, b) => a - b,
  );

  for (const role of rolesWithPermissions) {
    const rolePermIds = role.permissions
      .map((rp) => rp.permissionId)
      .sort((a, b) => a - b);

    if (
      rolePermIds.length === targetSorted.length &&
      rolePermIds.every((val, idx) => val === targetSorted[idx])
    ) {
      return role;
    }
  }

  return null;
}

module.exports = {
  validatePermissionDependencies,
  findMatchingPermissionRole,
};
