import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { initializePushNotifications } from "../utils/pushNotifications";

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", formData);
      const data = response.data;

      if (data.success) {
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("user", JSON.stringify(data.user));
        
        // Initialize push notifications after successful login
        initializePushNotifications().catch(err => 
          console.warn('Push notification setup failed:', err)
        );
        
        // Trigger a storage event to update App.jsx
        window.dispatchEvent(new Event('storage'));
        
        // Navigate after a small delay to ensure state updates
        setTimeout(() => {
          navigate("/");
        }, 100);
      } else {
        setError(data.error || "Invalid email or password");
        setLoading(false);
      }
    } catch (err) {
      console.error("Login error:", err);
      const errorMsg = err.response?.data?.error || err.message || "Invalid email or password";
      setError(errorMsg);
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Darwinbox Connect</h1>
        <h2>Login</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="auth-link">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
