import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch data from your Express backend
    fetch("http://localhost:8000/api/users")
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <h2>Loading users...</h2>;
  if (error) return <h2>Error: {error}</h2>;

  return (
    <div className="App">
      <h1>User Directory</h1>
      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            justifyContent: "center",
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
              }}
            >
              <h3>{user.name}</h3>
              <p>
                <strong>Role:</strong> {user.role}
              </p>
              <p>
                <small>ID: {user.id}</small>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
