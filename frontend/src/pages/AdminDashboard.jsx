import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import ChatLoader from "../components/common/ChatLoader";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [approvedUsers, setApprovedUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [approvalManagers, setApprovalManagers] = useState([]);
  const [editManagers, setEditManagers] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [pendingReports, setPendingReports] = useState([]);
  const [pendingRemovals, setPendingRemovals] = useState([]);
  const [reportThreshold, setReportThreshold] = useState(5);

  const [approvalForm, setApprovalForm] = useState({
    userId: null,
    designation: "SDE1",
    module: "",
    managerId: "",
  });

  const [editForm, setEditForm] = useState({
    userId: null,
    designation: "SDE1",
    module: "",
    managerId: "",
  });

  const clearLocalSession = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("storage"));
  };

  const redirectToLogin = () => {
    clearLocalSession();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      await Promise.all([
        fetchPendingUsers(),
        fetchApprovedUsers(),
        fetchModules(),
        fetchDesignations(),
        fetchPendingReports(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingUsers = async () => {
    try {
      const response = await api.get("/admin/pending-users");
      setPendingUsers(response.data.data);
    } catch (err) {
      if (err.response?.status === 401) {
        redirectToLogin();
        return;
      }
      if (err.response?.status === 403) {
        navigate("/");
        return;
      }
      setError("Failed to load pending users");
    }
  };

  const fetchApprovedUsers = async () => {
    try {
      const response = await api.get("/admin/users", {
        params: { status: "approved" },
      });
      setApprovedUsers(response.data.data || []);
    } catch (err) {
      console.error("Failed to load users");
    }
  };


  const fetchPendingReports = async () => {
    try {
      const response = await api.get("/admin/reports/pending");
      const payload = response.data?.data || {};
      setPendingReports(payload.reports || []);
      setPendingRemovals(payload.removals || []);
      if (payload.threshold) setReportThreshold(payload.threshold);
    } catch (err) {
      if (err.response?.status === 401) {
        redirectToLogin();
        return;
      }
      console.error("Failed to load reports");
    }
  };

  const handleApproveReport = async (reportId) => {
    setActionBusy("Approving report...");
    try {
      await api.post(`/admin/reports/${reportId}/approve`);
      setSuccessMessage("Report approved");
      await fetchPendingReports();
      setTimeout(() => setSuccessMessage(""), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to approve report");
      setTimeout(() => setError(""), 2500);
    } finally {
      setActionBusy("");
    }
  };

  const handleRejectReport = async (reportId) => {
    if (!confirm("Reject this report? It will not count toward the user's total.")) return;
    setActionBusy("Rejecting report...");
    try {
      await api.post(`/admin/reports/${reportId}/reject`);
      setSuccessMessage("Report rejected");
      await fetchPendingReports();
      setTimeout(() => setSuccessMessage(""), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reject report");
      setTimeout(() => setError(""), 2500);
    } finally {
      setActionBusy("");
    }
  };

  const handleApproveRemoval = async (actionId) => {
    if (!confirm("Approve removal? The user will be removed from the group and their messages will be hidden.")) return;
    setActionBusy("Removing user from group...");
    try {
      await api.post(`/admin/report-actions/${actionId}/approve`);
      setSuccessMessage("User removed from group");
      await fetchPendingReports();
      setTimeout(() => setSuccessMessage(""), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to approve removal");
      setTimeout(() => setError(""), 2500);
    } finally {
      setActionBusy("");
    }
  };

  const handleRejectRemoval = async (actionId) => {
    if (!confirm("Cancel this removal request? The user will stay in the group.")) return;
    setActionBusy("Cancelling removal...");
    try {
      await api.post(`/admin/report-actions/${actionId}/reject`);
      setSuccessMessage("Removal cancelled");
      await fetchPendingReports();
      setTimeout(() => setSuccessMessage(""), 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to cancel removal");
      setTimeout(() => setError(""), 2500);
    } finally {
      setActionBusy("");
    }
  };

  const formatReportedAt = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return "";
    }
  };

  const fetchModules = async () => {
    try {
      const response = await api.get("/users/modules");
      setModules(response.data.data || []);
    } catch (err) {
      console.error("Failed to load modules");
    }
  };

  const fetchDesignations = async () => {
    try {
      const response = await api.get("/admin/designations");
      setDesignations(response.data.data || []);
    } catch (err) {
      console.error("Failed to load designations");
    }
  };

  const loadEligibleManagers = async ({ module, designation, excludeUserId }, target) => {
    try {
      const response = await api.get("/admin/managers", {
        params: {
          module: module || undefined,
          designation: designation || undefined,
          excludeUserId: excludeUserId || undefined,
        },
      });
      if (target === "approval") setApprovalManagers(response.data.data || []);
      else setEditManagers(response.data.data || []);
    } catch {
      if (target === "approval") setApprovalManagers([]);
      else setEditManagers([]);
    }
  };

  const selectedApprovalDesignation = useMemo(
    () => approvalForm.designation,
    [approvalForm.designation],
  );

  const selectedEditDesignation = useMemo(
    () => editForm.designation,
    [editForm.designation],
  );

  const filteredApprovedUsers = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return approvedUsers;

    return approvedUsers.filter((user) => {
      return [
        user.name,
        user.email,
        user.designation,
        user.module,
        user.managerId?.name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [approvedUsers, employeeSearch]);

  useEffect(() => {
    if (!approvalForm.userId) return;
    setApprovalManagers([]);
    loadEligibleManagers(
      {
        module: approvalForm.module,
        designation: selectedApprovalDesignation,
        excludeUserId: approvalForm.userId,
      },
      "approval",
    );
  }, [approvalForm.userId, approvalForm.module, selectedApprovalDesignation]);

  useEffect(() => {
    if (!editForm.userId) return;
    setEditManagers([]);
    loadEligibleManagers(
      {
        module: editForm.module,
        designation: selectedEditDesignation,
        excludeUserId: editForm.userId,
      },
      "edit",
    );
  }, [editForm.userId, editForm.module, selectedEditDesignation]);

  const needsModule = (designation) => !["HR", "Admin"].includes(designation);

  const closeApprovalForm = () => {
    setApprovalForm({
      userId: null,
      designation: "SDE1",
      module: "",
      managerId: "",
    });
    setApprovalManagers([]);
  };

  const closeEditForm = () => {
    setEditForm({
      userId: null,
      designation: "SDE1",
      module: "",
      managerId: "",
    });
    setEditManagers([]);
  };

  const handleApprove = async (user) => {
    setApprovalForm({
      userId: user._id,
      designation: user.designation || "SDE1",
      module: user.module || "",
      managerId: user.managerId?._id || "",
    });
  };

  const submitApproval = async () => {
    setActionBusy("Approving user...");
    try {
      // Validate required fields
      if (needsModule(approvalForm.designation) && !approvalForm.module) {
        setError("Please select a module for this designation");
        setTimeout(() => setError(""), 3000);
        return;
      }

      const payload = {
        userId: approvalForm.userId,
        designation: approvalForm.designation,
        managerId: approvalForm.managerId || null,
      };

      if (needsModule(approvalForm.designation) && approvalForm.module) {
        payload.module = approvalForm.module;
      }

      const response = await api.post("/admin/approve-user", payload);

      if (response.data.success) {
        setSuccessMessage("User approved successfully");
        closeApprovalForm();
        await Promise.all([fetchPendingUsers(), fetchApprovedUsers()]);
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to approve user";
      
      // If user is not in pending status, just refresh the list silently
      if (errorMsg.toLowerCase().includes("not in pending status")) {
        closeApprovalForm();
        fetchPendingUsers();
        setSuccessMessage("User status has changed. List refreshed.");
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        setError(errorMsg);
        setTimeout(() => setError(""), 3000);
      }
    } finally {
      setActionBusy("");
    }
  };

  const handleEditUser = (user) => {
    setEditForm({
      userId: user._id,
      designation: user.designation || "SDE1",
      module: user.module || "",
      managerId: user.managerId?._id || "",
    });
  };

  const submitEditUser = async () => {
    setActionBusy("Saving hierarchy...");
    try {
      if (needsModule(editForm.designation) && !editForm.module) {
        setError("Please select a module for this designation");
        setTimeout(() => setError(""), 3000);
        return;
      }

      const payload = {
        userId: editForm.userId,
        designation: editForm.designation,
        managerId: editForm.managerId || null,
      };

      if (needsModule(editForm.designation) && editForm.module) {
        payload.module = editForm.module;
      }

      const response = await api.put("/admin/users/role", payload);
      if (response.data.success) {
        setSuccessMessage("User hierarchy updated successfully");
        closeEditForm();
        await fetchApprovedUsers();
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update user");
      setTimeout(() => setError(""), 3000);
    } finally {
      setActionBusy("");
    }
  };

  const handleReject = async (userId) => {
    if (!confirm("Are you sure you want to reject this user?")) return;

    setActionBusy("Updating user status...");
    try {
      const response = await api.post("/admin/reject-user", { userId });

      if (response.data.success) {
        setSuccessMessage("User rejected successfully");
        fetchPendingUsers();
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reject user");
      setTimeout(() => setError(""), 3000);
    } finally {
      setActionBusy("");
    }
  };

  const handleLogout = async () => {
    setActionBusy("Signing out...");
    clearLocalSession();
    navigate("/login", { replace: true });

    try {
      const { unsubscribeFromPushNotifications } = await import('../utils/pushNotifications');
      await unsubscribeFromPushNotifications();
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setActionBusy("");
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <ChatLoader
          message="Warming up the VibeConnect command center..."
          detail="Preparing conversations, users, and knowledge insights for your admin workspace."
        />
      </div>
    );
  }

  const busyMessage = actionBusy;

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="admin-subtitle">
            Manage users, analytics, and moderation from one clean workspace.
          </p>
        </div>
        <div className="admin-actions">
          <button onClick={handleLogout} className="btn-secondary">
            Logout
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}
      {busyMessage && (
        <div className="admin-busy-pill">
          <span className="admin-mini-chat" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{busyMessage}</span>
        </div>
      )}

      <div className="admin-content">
        <div className="admin-stat-grid">
          <div className="admin-stat-card">
            <span className="admin-stat-icon">👥</span>
            <div>
              <strong>{pendingUsers.length}</strong>
              <span>Pending approvals</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-icon">💬</span>
            <div>
              <strong>{approvedUsers.length}</strong>
              <span>Approved users</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-icon">🚩</span>
            <div>
              <strong>{pendingReports.length + pendingRemovals.length}</strong>
              <span>Pending reviews</span>
            </div>
          </div>
        </div>

        <h2>Pending Users ({pendingUsers.length})</h2>

        {pendingUsers.length === 0 ? (
          <p className="no-data">No pending users</p>
        ) : (
          <div className="pending-users-list">
            {pendingUsers.map((user) => (
              <div key={user._id} className="user-card">
                <div className="user-info">
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                  <p className="user-meta">
                    Registered:{" "}
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {approvalForm.userId === user._id ? (
                  <div className="approval-form">
                    <div className="form-group">
                      <label>Designation</label>
                      <select
                        value={approvalForm.designation}
                        onChange={(e) =>
                          setApprovalForm({
                            ...approvalForm,
                            designation: e.target.value,
                            managerId: "",
                            module: needsModule(e.target.value)
                              ? approvalForm.module
                              : "",
                          })
                        }
                      >
                        {designations.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {needsModule(approvalForm.designation) && (
                      <div className="form-group">
                        <label>Module *</label>
                        <select
                          value={approvalForm.module}
                          onChange={(e) =>
                            setApprovalForm({
                              ...approvalForm,
                              module: e.target.value,
                            })
                          }
                        >
                          <option value="">Select Module</option>
                          {modules.map((mod) => (
                            <option key={mod} value={mod}>
                              {mod}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Manager</label>
                      <select
                        value={approvalForm.managerId}
                        onChange={(e) =>
                          setApprovalForm({
                            ...approvalForm,
                            managerId: e.target.value,
                          })
                        }
                      >
                        <option value="">No Manager</option>
                        {approvalManagers.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} • {m.designation}
                          </option>
                        ))}
                      </select>
                      {approvalForm.module && approvalManagers.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                          No higher-level managers found in this module.
                        </div>
                      )}
                    </div>

                    <div className="form-actions">
                      <button onClick={submitApproval} className="btn-primary" disabled={!!actionBusy}>
                        Confirm Approval
                      </button>
                      <button
                        onClick={closeApprovalForm}
                        className="btn-secondary"
                        disabled={!!actionBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="user-actions">
                    <button
                      onClick={() => handleApprove(user)}
                      className="btn-approve"
                      disabled={!!actionBusy}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(user._id)}
                      className="btn-reject"
                      disabled={!!actionBusy}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: 28 }}>Manage Approved Users ({approvedUsers.length})</h2>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Search Employees</label>
          <input
            type="text"
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search by name, email, designation, module, or manager"
          />
        </div>
        {filteredApprovedUsers.length === 0 ? (
          <p className="no-data">No approved users</p>
        ) : (
          <div className="pending-users-list">
            {filteredApprovedUsers.map((user) => (
              <div key={user._id} className="user-card">
                <div className="user-info">
                  <h3>{user.name}</h3>
                  <p>{user.email}</p>
                  <p className="user-meta">
                    {user.designation || "—"}
                    {user.module ? ` • ${user.module}` : ""}
                    {user.managerId?.name ? ` • Reports to ${user.managerId.name}` : ""}
                  </p>
                </div>

                {editForm.userId === user._id ? (
                  <div className="approval-form">
                    <div className="form-group">
                      <label>Designation</label>
                      <select
                        value={editForm.designation}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            designation: e.target.value,
                            managerId: "",
                            module: needsModule(e.target.value)
                              ? editForm.module
                              : "",
                          })
                        }
                      >
                        {designations.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {needsModule(editForm.designation) && (
                      <div className="form-group">
                        <label>Module *</label>
                        <select
                          value={editForm.module}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              module: e.target.value,
                              managerId: "",
                            })
                          }
                        >
                          <option value="">Select Module</option>
                          {modules.map((mod) => (
                            <option key={mod} value={mod}>
                              {mod}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label>Manager</label>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                        Select a higher-level manager from the same module.
                      </div>
                      <select
                        value={editForm.managerId}
                        onChange={(e) =>
                          setEditForm({ ...editForm, managerId: e.target.value })
                        }
                      >
                        <option value="">No Manager</option>
                        {editManagers.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} • {m.designation}
                          </option>
                        ))}
                      </select>
                      {editForm.module && editManagers.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                          No higher-level managers found in this module.
                        </div>
                      )}
                    </div>

                    <div className="form-actions">
                      <button onClick={submitEditUser} className="btn-primary" disabled={!!actionBusy}>
                        Save
                      </button>
                      <button onClick={closeEditForm} className="btn-secondary" disabled={!!actionBusy}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="user-actions">
                    <button onClick={() => handleEditUser(user)} className="btn-approve" disabled={!!actionBusy}>
                      Edit Hierarchy
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: 28 }}>
          Reports & Moderation
          {pendingReports.length + pendingRemovals.length > 0 && (
            <span
              style={{
                marginLeft: 10,
                background: "#E53E3E",
                color: "white",
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 12,
                verticalAlign: "middle",
              }}
            >
              {pendingReports.length + pendingRemovals.length} pending
            </span>
          )}
        </h2>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            Pending Removals ({pendingRemovals.length})
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)" }}>
              triggered at {reportThreshold} approved reports
            </span>
          </h3>
          {pendingRemovals.length === 0 ? (
            <p className="no-data" style={{ marginBottom: 18 }}>No removals awaiting approval</p>
          ) : (
            <div className="pending-users-list" style={{ marginBottom: 18 }}>
              {pendingRemovals.map((action) => (
                <div key={action._id} className="user-card">
                  <div className="user-info">
                    <h3>{action.reportedUserId?.name || "Unknown user"}</h3>
                    <p>{action.reportedUserId?.email || "—"}</p>
                    <p className="user-meta">
                      Group: {action.chatId?.name || "Unknown group"} • {action.triggerCount} approved reports • requested {formatReportedAt(action.createdAt)}
                    </p>
                  </div>
                  <div className="user-actions">
                    <button
                      onClick={() => handleApproveRemoval(action._id)}
                      className="btn-reject"
                      disabled={!!actionBusy}
                    >
                      Approve Removal
                    </button>
                    <button
                      onClick={() => handleRejectRemoval(action._id)}
                      className="btn-secondary"
                      disabled={!!actionBusy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3>Pending Reports ({pendingReports.length})</h3>
          {pendingReports.length === 0 ? (
            <p className="no-data">No reports awaiting review</p>
          ) : (
            <div className="pending-users-list">
              {pendingReports.map((report) => {
                const reported = report.reportedUserId || {};
                const reporter = report.reportedByUserId || {};
                const chat = report.chatId || {};
                const preview = report.messagePreview;
                return (
                  <div key={report._id} className="user-card">
                    <div className="user-info" style={{ flex: 1 }}>
                      <h3>
                        {reported.name || "Unknown user"}
                        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
                          reported by {reporter.name || "Unknown"}
                        </span>
                      </h3>
                      <p>
                        Group: {chat.name || "Unknown group"} • submitted {formatReportedAt(report.createdAt)}
                      </p>
                      {report.reason && (
                        <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-primary)" }}>
                          <strong>Reason:</strong> {report.reason}
                        </p>
                      )}
                      {preview && (
                        <p
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: "var(--text-muted)",
                            background: "var(--input-bg)",
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <strong>Message:</strong>{" "}
                          {preview.isDeleted
                            ? "(deleted)"
                            : preview.snippet || `[${preview.type || "message"}]`}
                        </p>
                      )}
                    </div>
                    <div className="user-actions">
                      <button
                        onClick={() => handleApproveReport(report._id)}
                        className="btn-approve"
                        disabled={!!actionBusy}
                      >
                        Approve Report
                      </button>
                      <button
                        onClick={() => handleRejectReport(report._id)}
                        className="btn-secondary"
                        disabled={!!actionBusy}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}


