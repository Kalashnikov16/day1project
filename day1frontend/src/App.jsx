import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

const API_BASE = "http://localhost:8000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [userId, setUserId] = useState(
    Number(localStorage.getItem("userId")) || null,
  );
  const [permissions, setPermissions] = useState(
    JSON.parse(localStorage.getItem("permissions") || "[]"),
  );

  // Auth & Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // App & Directory State
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewTitle, setViewTitle] = useState("");

  // Product Form & Mode States
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Password Reset States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  // OTP Verification States
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Super Admin Dynamic RBAC States
  const [superAdminMode, setSuperAdminMode] = useState(null); // "manage_roles" | "assign_role" | null
  const [manageSubMode, setManageSubMode] = useState(null); // "create" | "delete" | null
  const [allPermissions, setAllPermissions] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [selectedPermIds, setSelectedPermIds] = useState([]);
  const [dupPermPrompt, setDupPermPrompt] = useState(null);
  const [deleteConflictModal, setDeleteConflictModal] = useState(null);
  const [selectedAssignRoleId, setSelectedAssignRoleId] = useState(null);
  const [assignUserIds, setAssignUserIds] = useState([]);

  const isLoggingOutRef = useRef(false);
  const refreshPromiseRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setResetTokenFromUrl(tokenParam);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    const currentToken = localStorage.getItem("token");
    if (currentToken) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout request failed", err);
      }
    }

    localStorage.clear();
    setToken("");
    setRole("");
    setUserId(null);
    setPermissions([]);
    setUsers([]);
    setProducts([]);
    setRequests([]);
    setViewTitle("");
    setSuperAdminMode(null);
    setManageSubMode(null);
    setEditingProductId(null);
    setDeleteMode(false);
    setSelectedProductIds([]);
    setEmail("");
    setPassword("");
    setName("");
    setError(null);
    setShowAddProductModal(false);
    setNewProductName("");
    setNewProductPrice("");
  }, []);

  const getRefreshedToken = useCallback(async () => {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        const refreshRes = await fetch(`${API_BASE}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!refreshRes.ok) {
          throw new Error("Session expired. Please log in again.");
        }

        const data = await refreshRes.json();
        localStorage.setItem("token", data.token);
        setToken(data.token);
        return data.token;
      })().finally(() => {
        refreshPromiseRef.current = null;
      });
    }

    return refreshPromiseRef.current;
  }, []);

  const fetchWithAuth = useCallback(
    async (url, options = {}) => {
      const currentToken = localStorage.getItem("token");

      const makeRequest = (authToken) =>
        fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          credentials: "include",
        });

      let response = await makeRequest(currentToken);

      if (response.status === 401) {
        try {
          const freshToken = await getRefreshedToken();
          response = await makeRequest(freshToken);
        } catch (err) {
          await handleLogout();
          throw err;
        }
      }

      return response;
    },
    [getRefreshedToken, handleLogout],
  );

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/products`);
      if (res.status === 403) {
        setProducts([]);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setProducts(data);
      }
    } catch (err) {
      console.error("Failed to fetch products", err);
    }
  }, [fetchWithAuth]);

  // Syncs localStorage & React state to DB source of truth WITHOUT logging out
  const syncUserStateFromBackend = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/users?scope=me`);
      if (!res.ok) return;
      const me = await res.json();

      if (me.role) {
        localStorage.setItem("role", me.role);
        setRole(me.role);
      }
      if (Array.isArray(me.permissions)) {
        localStorage.setItem("permissions", JSON.stringify(me.permissions));
        setPermissions(me.permissions);
      }
    } catch (err) {
      console.error("Failed to sync user state:", err);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    if (!token) return;

    isLoggingOutRef.current = false;
    syncUserStateFromBackend();
    fetchProducts();

    let eventSource;
    let reconnectTimer;
    let isCleanedUp = false;

    const connectSSE = () => {
      if (isCleanedUp || isLoggingOutRef.current) return;
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(`${API_BASE}/events`, {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.type === "ROLE_CHANGED" ||
            data.type === "ROLE_UPDATED" ||
            data.type === "ROLE_APPROVED"
          ) {
            if (isLoggingOutRef.current) return;

            alert(
              data.role
                ? `Your role has been changed to "${data.role}". You will now be logged out.`
                : "Your role has been changed. You will now be logged out.",
            );

            if (eventSource) eventSource.close();
            handleLogout();
          }
        } catch (err) {
          console.error("Failed to parse SSE message", err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        if (!isCleanedUp && !isLoggingOutRef.current) {
          reconnectTimer = setTimeout(connectSSE, 3000);
        }
      };
    };

    connectSSE();

    return () => {
      isCleanedUp = true;
      clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
    };
  }, [token, syncUserStateFromBackend, fetchProducts, handleLogout]);

  // ==========================================
  // AUTH & ACCOUNT HANDLERS
  // ==========================================
  const handleAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setSuccessMessage("");

    const endpoint = isRegistering
      ? `${API_BASE}/register`
      : `${API_BASE}/login`;
    const payload = isRegistering
      ? { name, email, password }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      if (isRegistering) {
        setPendingVerificationEmail(data.email);
        setSuccessMessage(data.message);
        setPassword("");
      } else {
        const perms = data.user.permissions || [];
        isLoggingOutRef.current = false;
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.user.role);
        localStorage.setItem("userId", data.user.id);
        localStorage.setItem("permissions", JSON.stringify(perms));

        setToken(data.token);
        setRole(data.user.role);
        setUserId(data.user.id);
        setPermissions(perms);

        setUsers([]);
        setRequests([]);
        setViewTitle("");
        setName("");
        setEmail("");
        setPassword("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingVerificationEmail,
          otp: otpInput,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setSuccessMessage(data.message);
      setTimeout(() => {
        setPendingVerificationEmail("");
        setIsRegistering(false);
        setSuccessMessage("");
        setOtpInput("");
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setForgotMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset link");
      }

      setForgotMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResetMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetTokenFromUrl, newPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setResetMessage(data.message);
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // USER DIRECTORY & ACCESS REQUEST HANDLERS
  // ==========================================
  const fetchMyDetails = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(`${API_BASE}/users?scope=me`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch details");
      }

      setUsers([data]);
      setRequests([]);
      setViewTitle("My Details");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDetails = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(`${API_BASE}/users`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch details");
      }

      setUsers(data);
      setRequests([]);
      setViewTitle("User Directory");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleUserDetails = async (targetUserId) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(`${API_BASE}/users/${targetUserId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch profile");
      }

      setUsers([data]);
      setViewTitle(`Profile Details for User ID: ${targetUserId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestUpgrade = async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/requests`, {
        method: "POST",
        body: JSON.stringify({ roleRequested: "Admin" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit request");
      }
      alert("Admin upgrade request submitted successfully!");
    } catch (err) {
      alert(err.message);
    }
  };

  const fetchPendingRequests = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(`${API_BASE}/requests/manage`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch requests");
      }

      setRequests(data);
      setUsers([]);
      setViewTitle("Pending Access Requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRequest = async (requestId, status) => {
    try {
      const response = await fetchWithAuth(
        `${API_BASE}/requests/${requestId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to process request");
      }

      alert(`Request ${status.toLowerCase()} successfully!`);
      fetchPendingRequests();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==========================================
  // PRODUCT CRUD HANDLERS
  // ==========================================
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`${API_BASE}/products`, {
        method: "POST",
        body: JSON.stringify({ name: newProductName, price: newProductPrice }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create product");
      }
      setNewProductName("");
      setNewProductPrice("");
      setShowAddProductModal(false);
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteSelectedProducts = async () => {
    if (
      !window.confirm("Are you sure you want to delete the selected products?")
    ) {
      return;
    }
    try {
      for (const id of selectedProductIds) {
        const res = await fetchWithAuth(`${API_BASE}/products/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Failed to delete product ${id}`);
        }
      }
      setSelectedProductIds([]);
      setDeleteMode(false);
      fetchProducts();
    } catch (err) {
      alert(err.message || "Failed to delete some products.");
    }
  };

  const handleUpdateProduct = async (productId) => {
    try {
      const payload =
        role === "Moderator"
          ? { price: editPrice }
          : { name: editName, price: editPrice };
      const res = await fetchWithAuth(`${API_BASE}/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update product");
      }
      setEditingProductId(null);
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==========================================
  // SUPER ADMIN DYNAMIC RBAC HANDLERS
  // ==========================================
  const openManageRoles = async () => {
    setSuperAdminMode("manage_roles");
    setManageSubMode(null);
    setDupPermPrompt(null);
    setDeleteConflictModal(null);
    try {
      const [permsRes, rolesRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/permissions`),
        fetchWithAuth(`${API_BASE}/roles`),
      ]);
      if (permsRes.ok) setAllPermissions(await permsRes.json());
      if (rolesRes.ok) setAllRoles(await rolesRes.json());
    } catch (err) {
      alert(err.message);
    }
  };

  const openAssignRole = async () => {
    setSuperAdminMode("assign_role");
    setSelectedAssignRoleId(null);
    setAssignUserIds([]);
    try {
      const [rolesRes, usersRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/roles`),
        fetchWithAuth(`${API_BASE}/users`),
      ]);
      if (rolesRes.ok) setAllRoles(await rolesRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (err) {
      alert(err.message);
    }
  };

  const hasReadPrerequisite = (permIds) => {
    const names = new Set(
      allPermissions.filter((p) => permIds.includes(p.id)).map((p) => p.name),
    );
    const needsProductRead =
      names.has("products:create") ||
      names.has("products:update_own") ||
      names.has("products:delete_own") ||
      names.has("products:update_any") ||
      names.has("products:delete_any");
    const hasProductRead =
      names.has("products:read") ||
      names.has("products:update_any") ||
      names.has("products:delete_any");

    if (needsProductRead && !hasProductRead) {
      alert(
        "You cannot select product create, update, or delete permissions without a product read permission.",
      );
      return false;
    }

    const hasUserRead =
      names.has("users:read_self") ||
      names.has("users:list_directory") ||
      names.has("users:read_any");
    if (names.has("requests:manage") && !hasUserRead) {
      alert(
        "You cannot select request management permissions without a user read permission.",
      );
      return false;
    }

    return true;
  };

  const submitCreateRole = async (confirmDuplicatePermissions = false) => {
    if (!newRoleName.trim()) {
      alert("Please enter a role name.");
      return;
    }
    if (!hasReadPrerequisite(selectedPermIds)) return;

    try {
      const res = await fetchWithAuth(`${API_BASE}/roles`, {
        method: "POST",
        body: JSON.stringify({
          name: newRoleName.trim(),
          permissionIds: selectedPermIds,
          confirmDuplicatePermissions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not create role");
        return;
      }

      if (data.requiresConfirmation) {
        setDupPermPrompt({
          message: data.message,
          matchingRoleName: data.matchingRoleName,
        });
        return;
      }

      alert(data.message);
      setDupPermPrompt(null);
      setNewRoleName("");
      setSelectedPermIds([]);
      setManageSubMode(null);
      openManageRoles();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAttemptDeleteRole = async (roleObj) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/roles/${roleObj.id}/reassign-and-delete`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();

      if (res.status === 409 && data.hasAssignedUsers) {
        const otherRoles = allRoles.filter((r) => r.id !== roleObj.id);
        setDeleteConflictModal({
          role: roleObj,
          count: data.assignedCount,
          users: data.assignedUsers,
          step: "alert",
          replacementRoleId: otherRoles[0]?.id || "",
        });
        return;
      }

      if (!res.ok) {
        alert(data.error || "Failed to delete role");
        return;
      }

      alert(data.message);
      openManageRoles();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConfirmReassignAndDelete = async () => {
    if (!deleteConflictModal?.replacementRoleId) {
      alert("Please choose a replacement role.");
      return;
    }

    try {
      const res = await fetchWithAuth(
        `${API_BASE}/roles/${deleteConflictModal.role.id}/reassign-and-delete`,
        {
          method: "POST",
          body: JSON.stringify({
            replacementRoleId: Number(deleteConflictModal.replacementRoleId),
          }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to reassign and delete role");
        return;
      }

      alert(data.message);
      setDeleteConflictModal(null);
      openManageRoles();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleConfirmAssignRole = async () => {
    if (!selectedAssignRoleId || assignUserIds.length === 0) {
      alert("Select a role and at least one user.");
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/users/assign-role`, {
        method: "POST",
        body: JSON.stringify({
          roleId: Number(selectedAssignRoleId),
          userIds: assignUserIds,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to assign role");
        return;
      }

      alert(data.message);
      setAssignUserIds([]);
      openAssignRole();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==========================================
  // UNAUTHENTICATED VIEWS
  // ==========================================
  if (!token) {
    return (
      <div className="App" style={{ marginTop: "5rem" }}>
        {error && <h3 style={{ color: "red" }}>{error}</h3>}

        {resetTokenFromUrl ? (
          <div>
            <h1>Set New Password</h1>
            {resetMessage && <h3 style={{ color: "green" }}>{resetMessage}</h3>}
            <form
              onSubmit={handleResetPasswordSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxWidth: "300px",
                margin: "0 auto",
              }}
            >
              <input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.5rem" }}
              >
                {loading ? "Updating..." : "Reset Password"}
              </button>
            </form>
          </div>
        ) : pendingVerificationEmail ? (
          <div>
            <h1>Enter Verification OTP</h1>
            <p style={{ color: "gray" }}>
              We sent a 6-digit code to {pendingVerificationEmail}
            </p>
            {successMessage && (
              <h3 style={{ color: "green" }}>{successMessage}</h3>
            )}
            <form
              onSubmit={handleVerifyOtpSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxWidth: "300px",
                margin: "0 auto",
              }}
            >
              <input
                type="text"
                placeholder="Enter 6-digit OTP"
                maxLength="6"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                required
                style={{
                  padding: "0.5rem",
                  textAlign: "center",
                  letterSpacing: "4px",
                  fontSize: "1.2rem",
                }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.5rem" }}
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </form>
          </div>
        ) : isForgotPassword ? (
          <div>
            <h1>Reset Password</h1>
            {forgotMessage && (
              <h3 style={{ color: "green" }}>{forgotMessage}</h3>
            )}
            <form
              onSubmit={handleForgotPasswordSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxWidth: "300px",
                margin: "0 auto",
              }}
            >
              <input
                type="email"
                placeholder="Enter your account email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.5rem" }}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <button
              onClick={() => {
                setIsForgotPassword(false);
                setError(null);
                setForgotMessage("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "blue",
                textDecoration: "underline",
                cursor: "pointer",
                marginTop: "1rem",
              }}
            >
              Back to Login
            </button>
          </div>
        ) : isRegistering ? (
          <div>
            <h1>Create an Account</h1>
            {successMessage && (
              <h3 style={{ color: "green" }}>{successMessage}</h3>
            )}
            <form
              onSubmit={handleAuth}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxWidth: "300px",
                margin: "0 auto",
              }}
            >
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.5rem" }}
              >
                {loading ? "Processing..." : "Register"}
              </button>
            </form>
            <button
              onClick={() => {
                setIsRegistering(false);
                setError(null);
                setSuccessMessage("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "blue",
                textDecoration: "underline",
                cursor: "pointer",
                marginTop: "1rem",
              }}
            >
              Already have an account? Login here.
            </button>
          </div>
        ) : (
          <div>
            <h1>Login</h1>
            <form
              onSubmit={handleAuth}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxWidth: "300px",
                margin: "0 auto",
              }}
            >
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ padding: "0.5rem" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{ padding: "0.5rem" }}
              >
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginTop: "1rem",
              }}
            >
              <button
                onClick={() => {
                  setIsRegistering(true);
                  setError(null);
                  setSuccessMessage("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "blue",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Need an account? Register here.
              </button>
              <button
                onClick={() => {
                  setIsForgotPassword(true);
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "gray",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Forgot your password?
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // AUTHENTICATED DASHBOARD VIEW
  // ==========================================
  return (
    <div className="App" style={{ padding: "2rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "1rem",
          borderBottom: "1px solid #eee",
        }}
      >
        <h2>
          Dashboard{" "}
          <small style={{ fontSize: "0.8rem", color: "gray" }}>({role})</small>
        </h2>
        <button
          onClick={handleLogout}
          style={{
            padding: "0.5rem 1rem",
            background: "#ff4444",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div
        style={{
          margin: "1.5rem 0",
          display: "flex",
          gap: "1rem",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {permissions.includes("users:read_self") && (
          <button
            onClick={fetchMyDetails}
            style={{ padding: "0.75rem", cursor: "pointer" }}
          >
            View My Details
          </button>
        )}
        {permissions.includes("users:list_directory") && (
          <button
            onClick={fetchAllDetails}
            style={{ padding: "0.75rem", cursor: "pointer" }}
          >
            View User Directory
          </button>
        )}

        {!permissions.includes("users:read_any") &&
          role !== "Moderator" &&
          role !== "SuperAdmin" && (
            <button
              onClick={handleRequestUpgrade}
              style={{
                padding: "0.75rem",
                cursor: "pointer",
                background: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "4px",
              }}
            >
              Request Admin Upgrade
            </button>
          )}

        {permissions.includes("requests:manage") && (
          <button
            onClick={fetchPendingRequests}
            style={{
              padding: "0.75rem",
              cursor: "pointer",
              background: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
            }}
          >
            Manage Upgrade Requests
          </button>
        )}
      </div>

      {/* SUPER ADMIN DYNAMIC RBAC CONTROLS */}
      {(role === "SuperAdmin" || permissions.includes("roles:manage")) && (
        <div
          style={{
            margin: "1.5rem 0",
            padding: "1.25rem",
            border: "1px solid #d0d7de",
            borderRadius: "8px",
            background: "#f8f9fa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Super Admin Role & Access Control</h3>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={openManageRoles}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#343a40",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Manage Roles
            </button>
            <button
              onClick={openAssignRole}
              style={{
                padding: "0.6rem 1.2rem",
                background: "#495057",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Assign Role
            </button>
          </div>

          {superAdminMode === "manage_roles" && (
            <div style={{ marginTop: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => setManageSubMode("create")}
                  style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
                >
                  Create Role
                </button>
                <button
                  onClick={() => setManageSubMode("delete")}
                  style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
                >
                  Delete Role
                </button>
              </div>

              {manageSubMode === "create" && (
                <div
                  style={{
                    marginTop: "1rem",
                    maxWidth: "500px",
                    marginInline: "auto",
                    textAlign: "left",
                    background: "#fff",
                    padding: "1rem",
                    borderRadius: "6px",
                    border: "1px solid #dee2e6",
                  }}
                >
                  <h4 style={{ marginTop: 0 }}>Create New Role</h4>
                  <input
                    type="text"
                    placeholder="Role Name (e.g., ContentEditor)"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.45rem",
                      marginBottom: "0.75rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    {allPermissions.map((perm) => (
                      <label
                        key={perm.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <input
                          type="checkbox"
                          value={perm.id}
                          checked={selectedPermIds.includes(perm.id)}
                          onChange={(e) => {
                            const id = Number(e.target.value);
                            setSelectedPermIds((prev) =>
                              e.target.checked
                                ? [...prev, id]
                                : prev.filter((x) => x !== id),
                            );
                          }}
                        />
                        {perm.name}
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => submitCreateRole(false)}
                    style={{
                      marginTop: "1rem",
                      padding: "0.5rem 1rem",
                      background: "#007bff",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Submit
                  </button>
                </div>
              )}

              {manageSubMode === "delete" && (
                <div
                  style={{
                    marginTop: "1rem",
                    maxWidth: "500px",
                    marginInline: "auto",
                    textAlign: "left",
                    background: "#fff",
                    padding: "1rem",
                    borderRadius: "6px",
                    border: "1px solid #dee2e6",
                  }}
                >
                  <h4 style={{ marginTop: 0 }}>All Roles</h4>
                  {allRoles.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <span>
                        <strong>{r.name}</strong> ({r.userCount} assigned)
                      </span>
                      {r.name !== "SuperAdmin" && (
                        <button
                          onClick={() => handleAttemptDeleteRole(r)}
                          style={{
                            background: "#dc3545",
                            color: "#fff",
                            border: "none",
                            padding: "0.3rem 0.7rem",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {superAdminMode === "assign_role" && (
            <div
              style={{
                marginTop: "1.25rem",
                maxWidth: "600px",
                marginInline: "auto",
                textAlign: "left",
                background: "#fff",
                padding: "1rem",
                borderRadius: "6px",
                border: "1px solid #dee2e6",
              }}
            >
              <h4 style={{ marginTop: 0 }}>Select a Role</h4>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "1rem",
                }}
              >
                {allRoles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedAssignRoleId(r.id)}
                    style={{
                      padding: "0.4rem 0.8rem",
                      background:
                        selectedAssignRoleId === r.id ? "#007bff" : "#e9ecef",
                      color: selectedAssignRoleId === r.id ? "#fff" : "#000",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>

              {selectedAssignRoleId && (
                <>
                  <h4>User Directory — Select Users to Assign</h4>
                  {users.map((u) => (
                    <label
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.35rem 0",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={assignUserIds.includes(u.id)}
                        onChange={(e) => {
                          const id = Number(u.id);
                          setAssignUserIds((prev) =>
                            e.target.checked
                              ? [...prev, id]
                              : prev.filter((x) => x !== id),
                          );
                        }}
                      />
                      {u.name} ({u.email || `ID: ${u.id}`}) — Current: {u.role}
                    </label>
                  ))}
                  <button
                    onClick={handleConfirmAssignRole}
                    style={{
                      marginTop: "1rem",
                      padding: "0.5rem 1rem",
                      background: "#28a745",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Assign Selected Role
                  </button>
                </>
              )}
            </div>
          )}

          {/* Duplicate Permission Set Pop-up */}
          {dupPermPrompt && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "1.5rem",
                  borderRadius: "8px",
                  maxWidth: "420px",
                  textAlign: "left",
                }}
              >
                <p style={{ marginTop: 0 }}>{dupPermPrompt.message}</p>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    justifyContent: "flex-end",
                    marginTop: "1rem",
                  }}
                >
                  <button onClick={() => setDupPermPrompt(null)}>Abort</button>
                  <button
                    onClick={() => {
                      setDupPermPrompt(null);
                      submitCreateRole(true);
                    }}
                  >
                    Continue with Different Name
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Role Assigned Users Pop-up & Reassignment */}
          {deleteConflictModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "1.5rem",
                  borderRadius: "8px",
                  maxWidth: "460px",
                  textAlign: "left",
                }}
              >
                {deleteConflictModal.step === "alert" ? (
                  <>
                    <p style={{ marginTop: 0 }}>
                      There are currently{" "}
                      <strong>{deleteConflictModal.count}</strong> people with
                      this role. Please assign them a different role to proceed.
                    </p>
                    <button
                      onClick={() =>
                        setDeleteConflictModal((prev) => ({
                          ...prev,
                          step: "reassign",
                        }))
                      }
                    >
                      OK
                    </button>
                  </>
                ) : (
                  <>
                    <h4 style={{ marginTop: 0 }}>
                      Reassign Users from &ldquo;{deleteConflictModal.role.name}
                      &rdquo;
                    </h4>
                    <p>
                      Users affected:{" "}
                      {deleteConflictModal.users.map((u) => u.name).join(", ")}
                    </p>
                    <select
                      value={deleteConflictModal.replacementRoleId}
                      onChange={(e) =>
                        setDeleteConflictModal((prev) => ({
                          ...prev,
                          replacementRoleId: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {allRoles
                        .filter((r) => r.id !== deleteConflictModal.role.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button onClick={() => setDeleteConflictModal(null)}>
                        Cancel
                      </button>
                      <button onClick={handleConfirmReassignAndDelete}>
                        Reassign &amp; Delete Role
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STYLIZED PRODUCTS TABLE GREETING */}
      <div
        style={{
          marginTop: "2rem",
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "1.5rem",
          background: "#fafafa",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <h3 style={{ margin: 0 }}>Product Catalog</h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {permissions.includes("products:create") && (
              <button
                onClick={() => setShowAddProductModal(true)}
                style={{
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                + Add Product
              </button>
            )}
            {(permissions.includes("products:delete_own") ||
              permissions.includes("products:delete_any")) && (
              <button
                onClick={() => {
                  setDeleteMode(!deleteMode);
                  setSelectedProductIds([]);
                }}
                style={{
                  background: deleteMode ? "#6c757d" : "#dc3545",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                {deleteMode ? "Cancel Delete" : "Delete Products"}
              </button>
            )}
            {deleteMode && selectedProductIds.length > 0 && (
              <button
                onClick={handleDeleteSelectedProducts}
                style={{
                  background: "#ffc107",
                  color: "black",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Confirm Delete ({selectedProductIds.length})
              </button>
            )}
          </div>
        </div>

        {showAddProductModal && (
          <form
            onSubmit={handleCreateProduct}
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1rem",
              background: "white",
              padding: "1rem",
              borderRadius: "6px",
              border: "1px solid #ddd",
            }}
          >
            <input
              type="text"
              placeholder="Product Name"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              required
              style={{ padding: "0.4rem", flex: 1 }}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Price ($)"
              value={newProductPrice}
              onChange={(e) => setNewProductPrice(e.target.value)}
              required
              style={{ padding: "0.4rem", width: "120px" }}
            />
            <button
              type="submit"
              style={{
                background: "#007bff",
                color: "white",
                border: "none",
                padding: "0.4rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddProductModal(false)}
              style={{
                background: "#ccc",
                border: "none",
                padding: "0.4rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </form>
        )}

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "white",
            borderRadius: "6px",
            overflow: "hidden",
            border: "1px solid #dee2e6",
          }}
        >
          <thead>
            <tr style={{ background: "#f1f3f5", textAlign: "left" }}>
              {deleteMode && (
                <th
                  style={{
                    padding: "0.75rem",
                    borderBottom: "1px solid #dee2e6",
                  }}
                >
                  Select
                </th>
              )}
              <th
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                Product Name
              </th>
              <th
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                Price
              </th>
              <th
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                Added By User
              </th>
              <th
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid #dee2e6",
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    padding: "1.5rem",
                    textAlign: "center",
                    color: "#6c757d",
                  }}
                >
                  No products available.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const isOwner = Number(p.userId) === Number(userId);
                const canDelete =
                  permissions.includes("products:delete_any") ||
                  (permissions.includes("products:delete_own") && isOwner);
                const canUpdate =
                  permissions.includes("products:update_any") ||
                  (permissions.includes("products:update_own") && isOwner);
                const isEditingRow = canUpdate && editingProductId === p.id;
                const canEditName = isEditingRow && role !== "Moderator";

                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                    {deleteMode && (
                      <td style={{ padding: "0.75rem" }}>
                        {canDelete && (
                          <input
                            type="checkbox"
                            value={p.id}
                            checked={selectedProductIds.includes(p.id)}
                            onChange={(e) => {
                              const id = Number(e.target.value);
                              setSelectedProductIds((prev) =>
                                prev.includes(id)
                                  ? prev.filter((x) => x !== id)
                                  : [...prev, id],
                              );
                            }}
                          />
                        )}
                      </td>
                    )}
                    <td style={{ padding: "0.75rem" }}>
                      {canEditName ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ padding: "0.3rem" }}
                        />
                      ) : (
                        p.name
                      )}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {isEditingRow ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          style={{ padding: "0.3rem", width: "90px" }}
                        />
                      ) : (
                        `$${Number(p.price).toFixed(2)}`
                      )}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {p.user?.name} (ID: {p.userId})
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {canUpdate &&
                        (isEditingRow ? (
                          <>
                            <button
                              onClick={() => handleUpdateProduct(p.id)}
                              style={{
                                background: "#28a745",
                                color: "white",
                                border: "none",
                                padding: "0.3rem 0.6rem",
                                marginRight: "4px",
                                borderRadius: "3px",
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingProductId(null)}
                              style={{
                                background: "#6c757d",
                                color: "white",
                                border: "none",
                                padding: "0.3rem 0.6rem",
                                borderRadius: "3px",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingProductId(p.id);
                              setEditName(p.name);
                              setEditPrice(p.price);
                            }}
                            style={{
                              background: "#17a2b8",
                              color: "white",
                              border: "none",
                              padding: "0.3rem 0.6rem",
                              borderRadius: "3px",
                              cursor: "pointer",
                            }}
                          >
                            Update
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {loading && <h2>Loading data...</h2>}
      {error && <h2 style={{ color: "red" }}>Error: {error}</h2>}

      {/* Directory / Profile Views */}
      {!loading &&
        users.length > 0 &&
        viewTitle !== "Pending Access Requests" &&
        superAdminMode !== "assign_role" && (
          <>
            <h3 style={{ marginTop: "2rem" }}>{viewTitle}</h3>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: "1rem",
              }}
            >
              {users.map((user) => (
                <div
                  key={user.id}
                  style={{
                    border: "1px solid #ccc",
                    padding: "1rem",
                    borderRadius: "8px",
                    minWidth: "200px",
                    textAlign: "left",
                    background: "white",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{user.name}</h3>
                  {viewTitle === "User Directory" ? (
                    <>
                      {permissions.includes("users:read_any") && (
                        <button
                          onClick={() => fetchSingleUserDetails(user.id)}
                          style={{
                            marginTop: "0.5rem",
                            padding: "0.4rem 0.8rem",
                            cursor: "pointer",
                          }}
                        >
                          View Full Details
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>Role:</strong> {user.role}
                      </p>
                      {user.email && (
                        <p>
                          <strong>Email:</strong> {user.email}
                        </p>
                      )}
                      <p>
                        <small>ID: {user.id}</small>
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

      {/* Pending Access Requests View */}
      {!loading && viewTitle === "Pending Access Requests" && (
        <>
          <h3 style={{ marginTop: "2rem" }}>Pending Access Requests</h3>
          {requests.length === 0 ? (
            <p>No pending requests found.</p>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "1rem",
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: "1rem",
              }}
            >
              {requests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    border: "1px solid #ccc",
                    padding: "1rem",
                    borderRadius: "8px",
                    minWidth: "250px",
                    textAlign: "left",
                    background: "white",
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{req.user.name}</h3>
                  <p>
                    <strong>Email:</strong> {req.user.email}
                  </p>
                  <p>
                    <strong>Requested Role:</strong> {req.roleRequested}
                  </p>
                  <p>
                    <small>Status: {req.status}</small>
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "1rem",
                    }}
                  >
                    <button
                      onClick={() => handleProcessRequest(req.id, "APPROVED")}
                      style={{
                        background: "#4CAF50",
                        color: "white",
                        border: "none",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleProcessRequest(req.id, "REJECTED")}
                      style={{
                        background: "#f44336",
                        color: "white",
                        border: "none",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
