import { useState } from "react";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // App State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewTitle, setViewTitle] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLogout = async () => {
    const currentToken = localStorage.getItem("token");
    if (currentToken) {
      try {
        await fetch("http://localhost:8000/api/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout request failed", err);
      }
    }

    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setToken("");
    setRole("");
    setUsers([]);
    setViewTitle("");
    setEmail("");
    setPassword("");
    setName("");
    setError(null);
  };

  // Interceptor Function: Catches 401s, asks backend to verify DB refresh token, and retries request
  const fetchWithAuth = async (url, options = {}) => {
    let currentToken = localStorage.getItem("token");

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${currentToken}`,
    };

    // 1. Execute initial API call (include credentials for cookies)
    let response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    // 2. Catch 401 Unauthorized (Access Token expired)
    if (response.status === 401) {
      const refreshRes = await fetch("http://localhost:8000/api/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!refreshRes.ok) {
        handleLogout();
        throw new Error("Session expired. Please log in again.");
      }

      const data = await refreshRes.json();

      // Store ONLY the new Access Token in localStorage and state
      localStorage.setItem("token", data.token);
      setToken(data.token);

      // Replay original request with the new Access Token
      headers.Authorization = `Bearer ${data.token}`;
      response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });
    }

    return response;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = isRegistering
      ? "http://localhost:8000/api/register"
      : "http://localhost:8000/api/login";
    const payload = isRegistering
      ? { name, email, password }
      : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include", // 🟢 Crucial to receive the HttpOnly Cookie on login
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Authentication failed");

      if (isRegistering) {
        alert("Account created successfully! Please log in.");
        setIsRegistering(false);
        setPassword("");
        setEmail("");
      } else {
        // 🟢 Store token and role upon successful login
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.user.role);
        setToken(data.token);
        setRole(data.user.role);

        setUsers([]);
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

  const fetchMyDetails = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        "http://localhost:8000/api/users/me",
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to fetch details");

      setUsers([data]); // Wraps single user object in an array cleanly
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
      const response = await fetchWithAuth("http://localhost:8000/api/users");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to fetch details");

      setUsers(data); // data is already an array of users
      setViewTitle("User Directory");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleUserDetails = async (userId) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetchWithAuth(
        `http://localhost:8000/api/users/${userId}`,
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to fetch profile");

      setUsers([data]); // Wraps single inspected profile in an array
      setViewTitle(`Profile Details for User ID: ${userId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="App" style={{ marginTop: "5rem" }}>
        <h1>{isRegistering ? "Create an Account" : "Login"}</h1>
        {error && <h3 style={{ color: "red" }}>{error}</h3>}

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
          {isRegistering && (
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={isRegistering}
              style={{ padding: "0.5rem" }}
            />
          )}
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
            {loading ? "Processing..." : isRegistering ? "Register" : "Login"}
          </button>
        </form>

        <button
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError(null);
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
          {isRegistering
            ? "Already have an account? Login here."
            : "Need an account? Register here."}
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem 2rem",
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

      <div
        style={{
          margin: "2rem 0",
          display: "flex",
          gap: "1rem",
          justifyContent: "center",
        }}
      >
        <button
          onClick={fetchMyDetails}
          style={{ padding: "0.75rem", cursor: "pointer" }}
        >
          View My Details
        </button>
        <button
          onClick={fetchAllDetails}
          style={{ padding: "0.75rem", cursor: "pointer" }}
        >
          View All Details
        </button>
      </div>

      {loading && <h2>Loading data...</h2>}
      {error && <h2 style={{ color: "red" }}>Error: {error}</h2>}

      {!loading && users.length > 0 && (
        <>
          <h3>{viewTitle}</h3>
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
                }}
              >
                {/* Always show the Name */}
                <h3 style={{ marginTop: 0 }}>{user.name}</h3>

                {/* CONDITION A: If viewing the User Directory, show ONLY name + Admin view button */}
                {viewTitle === "User Directory" ? (
                  <>
                    {role === "Admin" && (
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
                  /* CONDITION B: If viewing "My Details" or an inspected profile, show full info once */
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
    </div>
  );
}

export default App;
