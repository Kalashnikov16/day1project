import { useState } from "react";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [isRegistering, setIsRegistering] = useState(false); // Toggles between Login and Register views

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // App State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewTitle, setViewTitle] = useState("");

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
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Authentication failed");

      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUsers([]);
      setViewTitle("");

      // Reset form fields
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUsers([]);
    setEmail("");
    setPassword("");
  };

  const fetchMyDetails = async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to fetch details");
      setUsers([data]);
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
      const response = await fetch("http://localhost:8000/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to fetch details");
      setUsers(data);
      setViewTitle("User Directory");
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
            setError(null); // Clear errors when switching modes
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
        <h2>Dashboard</h2>
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
                <h3 style={{ marginTop: 0 }}>{user.name}</h3>
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
