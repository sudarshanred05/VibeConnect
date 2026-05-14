require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");

const connectDB = require("./config/db");
const initSocket = require("./socket");
const createDefaultAdmin = require("./utils/createAdmin");
const startReminderCron = require("./utils/reminderCron");

// Routes
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/users");
const chatRoutes = require("./routes/chats");
const messageRoutes = require("./routes/messages");
const reactionRoutes = require("./routes/reactions");
const seenRoutes = require("./routes/seen");
const pollRoutes = require("./routes/poll");
const uploadRoutes = require("./routes/upload");
const pushRoutes = require("./routes/push");
const reportRoutes = require("./routes/report");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.CLIENT_URL || "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 20000,
});
app.set("io", io);

connectDB();

createDefaultAdmin();
startReminderCron();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      process.env.CLIENT_URL || "http://localhost:3000"
    ],
    credentials: true,
  }),
);
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
});
app.use("/api/upload", uploadLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/messages", reportRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/reactions", reactionRoutes);
app.use("/api/seen", seenRoutes);
app.use("/api/poll", pollRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/push", pushRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.name === "MulterError") {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.message && (
    err.message.includes("Only ") ||
    err.message.includes("file type is not allowed")
  )) {
    return res.status(400).json({ success: false, error: err.message });
  }
  res.status(err.status || 500).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

initSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`VibeConnect server running on port ${PORT}`);
  console.log(`Socket.io ready`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
  