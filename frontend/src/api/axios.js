import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!err.response) return Promise.reject(err);

    const { status, data } = err.response;
    const originalRequest = err.config;

    if (status === 401 && data?.expired && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshData = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        if (refreshData.data.success) {
          localStorage.setItem("accessToken", refreshData.data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${refreshData.data.accessToken}`;
          return api(originalRequest);
        }
      } catch {
        localStorage.clear();
        window.location.href = "/login";
      }
    }

    if (status === 401 && !originalRequest.url?.includes("/auth/")) {
      localStorage.clear();
      window.location.href = "/login";
    }

    return Promise.reject(err);
  }
);

export default api;
