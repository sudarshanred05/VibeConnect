import { useState, useRef } from "react";
import { uploadImage, uploadFile } from "../../api";
import VoiceRecorder from "../Media/VoiceRecorder";
import PollCreator from "../Poll/PollCreator";

export default function MessageInput({
  chatId,
  currentUser,
  isGroup,
  chatMembers = [],
  disabled = false,
  disabledReason = "",
  replyTo,
  replyToId,
  onClearReply,
  onSendText,
  onFileSent,
  onVoiceSent,
  onPollCreated,
  socket,
  isMobile,
}) {
  const [text, setText] = useState("");
  const [showPoll, setShowPoll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const inputRef = useRef(null);
  const typingTimeout = useRef(null);

  const getReplyPreview = () => {
    if (!replyTo) return "";
    const replyType = replyTo.messageType || replyTo.type;
    if (replyType === "poll") {
      return `📊 ${replyTo.poll?.question || replyTo.metadata?.question || "Poll"}`;
    }
    if (replyType === "voice" || replyTo.voiceUrl || replyTo.metadata?.voiceUrl) {
      return "🎙 Voice message";
    }
    if (replyType === "image") {
      return "🖼 Image";
    }
    if (replyType === "file") {
      return `📎 ${replyTo.fileName || replyTo.metadata?.fileName || "File"}`;
    }
    return replyTo.content || "Message";
  };

  const updateMentionState = (nextText, caretPos) => {
    if (!isGroup) {
      setMentionOpen(false);
      return;
    }

    const uptoCaret = nextText.slice(0, caretPos);
    const match = uptoCaret.match(/(^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (!match) {
      setMentionOpen(false);
      return;
    }

    const query = (match[2] || "").toLowerCase();
    const start = caretPos - query.length - 1;

    const filtered = (chatMembers || [])
      .filter((m) => m?._id !== currentUser._id)
      .filter((m) => !query || (m.name || "").toLowerCase().includes(query))
      .slice(0, 6);

    if (!filtered.length) {
      setMentionOpen(false);
      return;
    }

    setMentionCandidates(filtered);
    setMentionIndex(0);
    setMentionStart(start);
    setMentionOpen(true);
  };

  const applyMention = (member) => {
    if (!member || mentionStart < 0) return;
    const el = inputRef.current;
    const caretPos = el?.selectionStart ?? text.length;
    const prefix = text.slice(0, mentionStart);
    const suffix = text.slice(caretPos);
    const mentionTag = `@${(member.name || "").replace(/\s+/g, "")}`;
    const nextText = `${prefix}${mentionTag} ${suffix}`;
    setText(nextText);
    setMentionOpen(false);

    requestAnimationFrame(() => {
      if (!el) return;
      const pos = (prefix + mentionTag + " ").length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleType = (e) => {
    if (disabled) return;
    const newText = e.target.value;
    // Enforce 1000 character limit
    if (newText.length > 1000) {
      return;
    }
    setText(newText);
    updateMentionState(newText, e.target.selectionStart || 0);
    if (socket && chatId) {
      socket.emit("typing_start", {
        chatId,
        userId: currentUser._id,
        userName: currentUser.name,
      });
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit("typing_stop", { chatId, userId: currentUser._id });
      }, 2000);
    }
  };

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed, replyTo?._id || null);
    setText("");
    if (socket && chatId)
      socket.emit("typing_stop", { chatId, userId: currentUser._id });
    onClearReply && onClearReply();
    inputRef.current?.focus();
  };

  const handleKey = (e) => {
    if (disabled) return;

    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((v) => (v + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((v) => (v - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        applyMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e, type) => {
    if (disabled) return;
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile({ file, type });
    setShowCaptionModal(true);
  };

  const handleUploadWithCaption = async () => {
    if (disabled) return;
    if (!pendingFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile.file);
      formData.append("chatId", chatId);
      formData.append("senderId", currentUser._id);
      if (replyToId) {
        formData.append("replyTo", replyToId);
      }
      if (captionText.trim()) {
        formData.append("caption", captionText);
      }
      const res =
        pendingFile.type === "image"
          ? await uploadImage(formData)
          : await uploadFile(formData);
      onFileSent && onFileSent(res.data?.data || res.data);
      setShowCaptionModal(false);
      setCaptionText("");
      setPendingFile(null);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {showCaptionModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !uploading && setShowCaptionModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 20,
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}>
              Add Caption
            </h3>
            <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)", fontSize: 12 }}>
              File: {pendingFile?.file?.name}
            </p>
            <textarea
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              placeholder="Add a caption (optional)…"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 80,
                boxSizing: "border-box",
                marginBottom: 12,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowCaptionModal(false);
                  setCaptionText("");
                  setPendingFile(null);
                }}
                disabled={uploading}
                style={{
                  padding: "8px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: uploading ? "not-allowed" : "pointer",
                  opacity: uploading ? 0.5 : 1,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadWithCaption}
                disabled={uploading}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: 8,
                  background: uploading ? "var(--border)" : "var(--navy)",
                  color: "#fff",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPoll && (
        <PollCreator
          chatId={chatId}
          senderId={currentUser._id}
          replyToId={replyToId || null}
          onCreated={(msg) => {
            onPollCreated && onPollCreated(msg);
            setShowPoll(false);
          }}
          onClose={() => setShowPoll(false)}
        />
      )}

      <div
        style={{
          padding: isMobile ? "8px 12px" : "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {disabled && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: 8,
              background: "#FEF2F2",
              color: "#B91C1C",
              border: "1px solid #FECACA",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {disabledReason || "Messaging is disabled for this chat"}
          </div>
        )}

        {replyTo && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: "var(--hover-bg)",
              borderRadius: 8,
              marginBottom: 10,
              borderLeft: "3px solid var(--navy)",
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ↩ Replying to: {getReplyPreview()}
            </div>
            <button
              onClick={onClearReply}
              disabled={disabled}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: 16,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {isGroup && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button
              onClick={() => !disabled && setShowPoll(true)}
              disabled={disabled}
              style={{
                fontSize: 11,
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--text-muted)",
                fontWeight: 500,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              📊 Poll
            </button>
            <label
              style={{
                fontSize: 11,
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--text-muted)",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              🖼 Image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e, "image")}
                disabled={disabled}
              />
            </label>
            <label
              style={{
                fontSize: 11,
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--text-muted)",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 500,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              📎 File
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e, "file")}
                disabled={disabled}
              />
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          {!isGroup && (
            <div style={{ display: "flex", gap: 6 }}>
              <label
                title="Send image"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--hover-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--navy)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="9" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e, "image")}
                  disabled={disabled}
                />
              </label>
              <label
                title="Send file"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--hover-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--navy)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e, "file")}
                  disabled={disabled}
                />
              </label>
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--input-bg)",
                border: "1.5px solid var(--border)",
                borderRadius: 12,
                padding: "10px 14px",
                gap: 8,
                position: "relative",
              }}
            >
              <textarea
                className="message-composer-input"
                ref={inputRef}
                value={text}
                onChange={handleType}
                onKeyDown={handleKey}
                rows={1}
                placeholder={disabled ? "You can no longer message in this group" : "Type a message…"}
                disabled={disabled}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  fontSize: 14,
                  color: "var(--text-primary)",
                  resize: "none",
                  fontFamily: "inherit",
                  minHeight: 20,
                  maxHeight: 120,
                  lineHeight: 1.5,
                  overflow: "auto",
                }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onClick={(e) => updateMentionState(e.target.value, e.target.selectionStart || 0)}
              />
              {mentionOpen && (
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    right: 54,
                    bottom: "calc(100% + 6px)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.16)",
                    maxHeight: 220,
                    overflowY: "auto",
                    zIndex: 30,
                  }}
                >
                  {mentionCandidates.map((m, idx) => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => applyMention(m)}
                      style={{
                        width: "100%",
                        border: "none",
                        background: idx === mentionIndex ? "var(--hover-bg)" : "transparent",
                        color: "var(--text-primary)",
                        textAlign: "left",
                        padding: "9px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      @{(m.name || "").replace(/\s+/g, "")}
                    </button>
                  ))}
                </div>
              )}
              <VoiceRecorder
                chatId={chatId}
                senderId={currentUser._id}
                replyToId={replyToId || null}
                onSent={onVoiceSent}
                disabled={disabled}
              />
            </div>
            {text.length > 0 && (
              <div style={{ 
                fontSize: 10, 
                color: text.length > 900 ? '#E53E3E' : 'var(--text-muted)', 
                marginTop: 4,
                textAlign: 'right',
                paddingRight: 4
              }}>
                {text.length}/1000
              </div>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={disabled || !text.trim() || uploading}
            title="Send message"
            aria-label="Send message"
            style={{
              background: !disabled && text.trim() ? "var(--navy)" : "var(--border)",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
              cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
              opacity: disabled ? 0.7 : 1,
              boxShadow: !disabled && text.trim() ? "0 8px 18px rgba(30, 58, 95, 0.18)" : "none",
            }}
          >
            {uploading ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "appLoaderSpin 0.9s linear infinite" }}>
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M4.93 4.93l2.83 2.83" />
                <path d="M16.24 16.24l2.83 2.83" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
                <path d="M4.93 19.07l2.83-2.83" />
                <path d="M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
