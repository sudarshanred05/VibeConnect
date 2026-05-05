import { useState } from "react";
import { useReportUser } from "../../hooks/useReportUser";

export default function ReportUserModal({
  userId,
  userName,
  chatId,
  messageId = null,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState("");
  const { reportUser, isReporting, reportError } = useReportUser();
  const [successMessage, setSuccessMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await reportUser(userId, chatId, reason || null, messageId);

    if (result.success) {
      setSuccessMessage(result.message);
      setTimeout(() => {
        if (result.userDeleted) {
          onSuccess?.({ userDeleted: true, userName });
        } else {
          onSuccess?.({ 
            userDeleted: false, 
            reportCount: result.reportCount,
            userName 
          });
        }
        onClose();
      }, 1500);
    }
  };

  return (
    <div
      onClick={() => !isReporting && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary)",
          borderRadius: 12,
          padding: "24px",
          maxWidth: 400,
          width: "100%",
          border: "1px solid var(--border)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>
          Report {userName}
        </h2>

        {reportError && (
          <div
            style={{
              background: "rgba(220, 53, 69, 0.12)",
              color: "#842029",
              padding: "12px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              border: "1px solid rgba(220, 53, 69, 0.28)",
            }}
          >
            {reportError}
          </div>
        )}

        {successMessage && (
          <div
            style={{
              background: "rgba(25, 135, 84, 0.12)",
              color: "#0f5132",
              padding: "12px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              border: "1px solid rgba(25, 135, 84, 0.28)",
            }}
          >
            ✓ {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 13,
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why you're reporting this user..."
              disabled={isReporting}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                fontSize: 13,
                resize: "vertical",
                minHeight: 80,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isReporting}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--hover-bg)",
                color: "var(--text-primary)",
                cursor: isReporting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                opacity: isReporting ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isReporting}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 8,
                border: "none",
                background: "var(--danger)",
                color: "white",
                cursor: isReporting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                opacity: isReporting ? 0.6 : 1,
              }}
            >
              {isReporting ? "Reporting..." : "Report User"}
            </button>
          </div>
        </form>

        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          ⚠️ After 5 reports in a group, the user will be automatically deleted.
        </p>
      </div>
    </div>
  );
}
