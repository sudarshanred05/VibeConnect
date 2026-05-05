import { useState, useEffect } from "react";
import { getUsers } from "../../api/index";
import { useTheme } from "../../context/ThemeContext";

export default function UserSelect({ onSelect }) {
  const { dark } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await getUsers();
        setUsers(response.data || []);
      } catch (err) {
        setError(err.message || "Failed to fetch users");
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleSelectUser = (user) => {
    onSelect(user);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: dark ? "#1a1a1a" : "#f5f5f5",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
          padding: "40px",
          maxWidth: "600px",
          backgroundColor: dark ? "#2d2d2d" : "#ffffff",
          borderRadius: "12px",
          boxShadow: dark
            ? "0 4px 12px rgba(0, 0, 0, 0.5)"
            : "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <h1
          style={{
            fontSize: "28px",
            fontWeight: "600",
            color: dark ? "#ffffff" : "#000000",
            margin: "0 0 20px 0",
          }}
        >
          Select a User
        </h1>

        {loading && (
          <div
            style={{
              fontSize: "16px",
              color: dark ? "#aaaaaa" : "#666666",
            }}
          >
            Loading users...
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: "14px",
              color: "#ff4444",
              backgroundColor: dark ? "#3a2424" : "#ffe0e0",
              padding: "12px 16px",
              borderRadius: "8px",
              width: "100%",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "16px",
              width: "100%",
              maxHeight: "400px",
              overflowY: "auto",
            }}
          >
            {users.length > 0 ? (
              users.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleSelectUser(user)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    padding: "16px",
                    backgroundColor: dark ? "#3d3d3d" : "#f9f9f9",
                    border: `2px solid ${dark ? "#4d4d4d" : "#e0e0e0"}`,
                    borderRadius: "12px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    minHeight: "140px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = dark ? "#6d6d6d" : "#bbbbbb";
                    e.currentTarget.style.backgroundColor = dark ? "#454545" : "#f0f0f0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = dark ? "#4d4d4d" : "#e0e0e0";
                    e.currentTarget.style.backgroundColor = dark ? "#3d3d3d" : "#f9f9f9";
                  }}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        backgroundColor: dark ? "#5d5d5d" : "#dddddd",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                        fontWeight: "600",
                        color: dark ? "#ffffff" : "#333333",
                      }}
                    >
                      {user.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: dark ? "#ffffff" : "#000000",
                      textAlign: "center",
                      wordBreak: "break-word",
                    }}
                  >
                    {user.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: dark ? "#888888" : "#999999",
                    }}
                  >
                    {user.isOnline ? "🟢 Online" : "🔘 Offline"}
                  </div>
                </button>
              ))
            ) : (
              <div
                style={{
                  fontSize: "14px",
                  color: dark ? "#888888" : "#999999",
                  textAlign: "center",
                  gridColumn: "1 / -1",
                }}
              >
                No users available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
