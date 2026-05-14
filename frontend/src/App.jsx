import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { SocketProvider, useSocket } from "./context/SocketContext";
import Sidebar from "./components/Sidebar/Sidebar";
import ChatWindow from "./components/Chat/ChatWindow";
import RightSidebar from "./components/Sidebar/RightSidebar";
import CreateGroupModal from "./components/Group/CreateGroupModal";
import ChatLoader from "./components/common/ChatLoader";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AdminDashboard from "./pages/AdminDashboard";

function ChatApp({ currentUser }) {
  const { dark, toggleTheme } = useTheme();
  const { socket } = useSocket();
  const [activeChat, setActiveChat] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupCreatedCb, setGroupCreatedCb] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [triggerDM, setTriggerDM] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setShowSidebar(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    if (isMobile) setShowSidebar(false);
  };

  // Handle chat updates from ChatWindow (real-time member changes)
  const handleChatUpdate = useCallback((updatedChat) => {
    setActiveChat(updatedChat);
  }, []);

  // Sync activeChat status in real-time
  useEffect(() => {
    if (!socket) return;
    const onStatus = ({ userId, isOnline, lastSeen }) => {
      setActiveChat((prev) => {
        if (!prev) return prev;
        const isMember = prev.members?.some((m) => (m._id || m) === userId);
        if (!isMember) return prev;

        const updatedMembers = prev.members.map((m) => {
          const mId = m._id || m;
          if (mId === userId) {
            return typeof m === "object" ? { ...m, isOnline, lastSeen } : m;
          }
          return m;
        });
        return { ...prev, members: updatedMembers };
      });
    };
    socket.on("user_status", onStatus);
    return () => socket.off("user_status", onStatus);
  }, [socket]);

  const handleCreateGroup = (callback) => {
    setGroupCreatedCb(() => callback);
    setShowCreateGroup(true);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Sidebar
        currentUser={currentUser}
        activeChat={activeChat}
        onSelectChat={handleSelectChat}
        onCreateGroup={handleCreateGroup}
        darkMode={dark}
        onToggleTheme={toggleTheme}
        socket={socket}
        isVisible={showSidebar}
        isMobile={isMobile}
        openDM={triggerDM}
        onDMClosed={() => setTriggerDM(false)}
      />

      <div
        style={{
          flex: 1,
          display: isMobile && showSidebar ? "none" : "flex",
          minWidth: 0,
          height: "100%",
        }}
      >
        <ChatWindow
          chat={activeChat}
          currentUser={currentUser}
          socket={socket}
          onNewMessage={(msg) => {}}
          onChatUpdate={handleChatUpdate}
          onSelectChat={setActiveChat}
          onBack={() => {
            setActiveChat(null);
            if (isMobile) setShowSidebar(true);
          }}
          isMobile={isMobile}
          onStartDM={() => setTriggerDM(true)}
          onNewGroup={() => handleCreateGroup(setActiveChat)}
        />
        {activeChat && !isMobile && (
          <RightSidebar
            chat={activeChat}
            currentUser={currentUser}
          />
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal
          currentUserId={currentUser._id}
          onCreated={(chat) => {
            if (groupCreatedCb) groupCreatedCb(chat);
            setShowCreateGroup(false);
          }}
          onClose={() => setShowCreateGroup(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const loadUser = () => {
      const token = localStorage.getItem("accessToken");
      const user = localStorage.getItem("user");
      if (token && user) {
        setCurrentUser(JSON.parse(user));
      } else {
        setCurrentUser(null);
      }
    };

    // Load user on mount
    loadUser();

    // Listen for storage changes (including custom storage event from login)
    window.addEventListener('storage', loadUser);
    
    return () => window.removeEventListener('storage', loadUser);
  }, []);

  const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    
    if (!token) {
      return <Navigate to="/login" replace />;
    }
    
    // Redirect admin to admin dashboard
    if (user.role === "admin") {
      return <Navigate to="/admin" replace />;
    }
    
    return children;
  };

  const AdminRoute = ({ children }) => {
    const token = localStorage.getItem("accessToken");
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!token) {
      return <Navigate to="/login" replace />;
    }
    if (user.role !== "admin") {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ThemeProvider>
                {currentUser ? (
                  <SocketProvider userId={currentUser._id}>
                    <ChatApp
                      currentUser={currentUser}
                    />
                  </SocketProvider>
                ) : (
                  <ChatLoader
                    message="Opening VibeConnect..."
                    detail="Preparing your chats and workspace."
                  />
                )}
              </ThemeProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
