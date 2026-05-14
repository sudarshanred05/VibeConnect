import { memo, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../common/Avatar";
import PollMessage from "../Poll/PollMessage";
import { normalizeEmoji, ALLOWED_EMOJIS } from "../../utils/emojiNormalizer";
import { reportMessage } from "../../api";
const API_URL =
  import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";
const MEDIA_PROXY_URL = `${API_URL}/api/upload/media`;

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(value || "");
const extractMediaKey = (value) => {
  if (!value) return "";
  const raw = String(value).split("?")[0];

  if (!isAbsoluteUrl(raw) && /^(images|files|voice)\//i.test(raw)) {
    return raw;
  }

  if (!isAbsoluteUrl(raw) && raw.startsWith("/uploads/")) {
    return null;
  }

  let pathValue = raw;
  if (isAbsoluteUrl(raw)) {
    try {
      pathValue = new URL(raw).pathname;
    } catch {
      pathValue = raw;
    }
  }

  const normalized = String(pathValue).replace(/^\/+/, "");
  const match = normalized.match(/(images|files|voice)\/.*$/i);
  return match ? match[0] : "";
};

const toMediaUrl = (value, options = {}) => {
  if (!value) return "";
  const key = extractMediaKey(value);
  const filename = options.filename || "";
  const disposition = options.disposition || "inline";

  if (key) {
    const params = new URLSearchParams({ key, disposition });
    if (filename) params.set("filename", filename);
    return `${MEDIA_PROXY_URL}?${params.toString()}`;
  }

  if (!isAbsoluteUrl(value) && value.startsWith("/uploads/")) {
    return `${API_URL}${value}`;
  }

  return value;
};

const isImageLike = (value = "") => {
  const lower = String(value).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
    lower.includes(ext),
  );
};

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const raw = value._id ?? value.id;
    return raw ? String(raw) : "";
  }
  return String(value);
};

const formatTime = (createdAt) => {
  if (!createdAt) return "";
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getFileIcon = (fileName) => {
  if (!fileName) return "📄";
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  
  const iconMap = {
    pdf: "📕",
    doc: "📘",
    docx: "📘",
    txt: "📄",
    xls: "📗",
    xlsx: "📗",
    ppt: "📙",
    pptx: "📙",
    zip: "📦",
    rar: "📦",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🎬",
    mp3: "🎵",
    mp4: "🎬",
    csv: "📊",
  };
  
  return iconMap[ext] || "📄";
};

const MAX_LIST_VISIBLE_USERS = 6;
const ALLOWED_NORMALIZED_EMOJIS = ALLOWED_EMOJIS.map(normalizeEmoji);

const getReactionUserName = (reactor) => {
  if (typeof reactor?.userId === "object") return reactor.userId?.name || "Unknown";
  return reactor?.userName || "Unknown";
};

function MessageBubble({
  message,
  isMe,
  showSender,
  currentUserId,
  onReact,
  onPollVote,
  onReply,
  onEdit,
  onDelete,
  onReplyPrivately,
  onMentionClick,
  isGroupChat,
  chatId,
  chatMembers = [],
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showSeenBy, setShowSeenBy] = useState(false);
  const [selectedEmojiReactions, setSelectedEmojiReactions] = useState(null);
  const menuRef = useRef(null);

  const {
    senderId,
    messageType,
    content,
    fileUrl,
    fileName,
    fileSize,
    caption,
    voiceUrl,
    voiceDuration,
    reactions = [],
    seenBy = [],
    replyTo,
    isDeleted,
    isEdited,
    poll,
    createdAt,
  } = message;

  // senderId can be a full object OR just an ID string
  const senderVal = senderId && typeof senderId === "object" ? senderId : null;
  const senderIdStr = toIdString(senderId);
  const isSystem = messageType === "system" || messageType === "ai" || message?.metadata?.systemSubtype === "ai";
  const timeStr = formatTime(createdAt);
  const resolvedFileUrl = toMediaUrl(fileUrl, { disposition: "inline", filename: fileName || "file" });
  const resolvedVoiceUrl = toMediaUrl(voiceUrl, { disposition: "inline", filename: fileName || "voice" });
  const resolvedDownloadFileUrl = toMediaUrl(fileUrl, {
    disposition: "attachment",
    filename: fileName || "file",
  });
  const fileLooksLikeImage = messageType === "file" && (isImageLike(fileName) || isImageLike(fileUrl));
  const replyType = replyTo?.messageType || replyTo?.type;
  const replyFileUrl = replyTo?.fileUrl || replyTo?.metadata?.fileUrl;
  const replyVoiceUrl = replyTo?.voiceUrl || replyTo?.metadata?.voiceUrl;
  const replyFileName = replyTo?.fileName || replyTo?.metadata?.fileName;
  const replyIsImage = replyType === "image" || (replyType === "file" && (isImageLike(replyFileName) || isImageLike(replyFileUrl)));

  const replyPreviewText = useMemo(() => {
    if (!replyTo) return "";
    if (replyType === "poll") return `📊 ${replyTo?.poll?.question || replyTo?.metadata?.question || "Poll"}`;
    if (replyType === "voice" || replyVoiceUrl) return "🎙 Voice message";
    if (replyType === "file") return `📎 ${replyFileName || "File"}`;
    if (replyType === "image") return "🖼 Image";
    return replyTo?.content || replyType || "Message";
  }, [replyTo, replyType, replyVoiceUrl, replyFileName]);

  const renderRichText = (value) => {
    const text = typeof value === "object" && value !== null ? "[Encrypted message]" : String(value || "");
    const parts = text.split(/(\*\*[\s\S]+?\*\*|@[a-zA-Z0-9_.-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} style={{ fontWeight: 800, color: "inherit" }}>
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (!part.startsWith("@")) return <span key={index}>{part}</span>;
      return (
        <span
          key={index}
          onClick={() => onMentionClick?.(part.slice(1))}
          style={{
            color: isMe ? "#C7E0FF" : "#2563EB",
            fontWeight: 700,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {part}
        </span>
      );
    });
  };

  useEffect(() => {
    if (!showMenu) return;
    const onDocClick = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showMenu]);

  // Validation: Don't render messages without proper content for their type
  const isValidMessage = useMemo(() => {
    // System messages can have any content
    if (messageType === "system") return true;

    // Text messages need content
    if (messageType === "text" && !content) return false;

    // Image messages need fileUrl
    if (messageType === "image" && !fileUrl) return false;

    // File messages need fileUrl
    if (messageType === "file" && !fileUrl) return false;

    // Voice messages need voiceUrl
    if (messageType === "voice" && !voiceUrl) return false;

    // Poll messages need poll data
    if (messageType === "poll" && !poll) return false;

    // Messages must have a sender ID
    if (!senderId) return false;

    return true;
  }, [messageType, content, fileUrl, voiceUrl, poll, senderId]);

  // Don't render invalid messages
  if (!isValidMessage) {
    console.warn("Invalid message filtered out:", { messageType, hasContent: !!content, hasFileUrl: !!fileUrl, hasVoiceUrl: !!voiceUrl, hasPoll: !!poll, senderId, senderVal });
    return null;
  }

  // Filter reactions by validating with normalized comparison (but keep original emoji)
  const validReactions = useMemo(
    () =>
      reactions.filter((r) => {
        const normalized = normalizeEmoji(r.emoji);
        return normalized && ALLOWED_NORMALIZED_EMOJIS.includes(normalized);
      }),
    [reactions],
  );

  const grouped = useMemo(
    () =>
      validReactions.reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
      }, {}),
    [validReactions],
  );

  // Check if current user already reacted with a given emoji
  const myEmoji = useMemo(
    () =>
      validReactions.find(
        (r) =>
          r.emoji &&
          (r.userId === currentUserId || r.userId?._id === currentUserId),
      )?.emoji,
    [validReactions, currentUserId],
  );

  const getSeenUserName = (seenEntry) => {
    const rawUser = seenEntry?.userId;
    if (rawUser && typeof rawUser === "object" && rawUser.name) return rawUser.name;

    const seenUserId = toIdString(rawUser);
    const matchedMember = (chatMembers || []).find(
      (m) => toIdString(m?._id || m?.id || m) === seenUserId,
    );
    return matchedMember?.name || "Unknown User";
  };

  const seenEntries = useMemo(
    () =>
      (seenBy || [])
        .filter((entry) => toIdString(entry?.userId) !== toIdString(senderId))
        .filter((entry, idx, arr) => {
          const id = toIdString(entry?.userId);
          return id && arr.findIndex((x) => toIdString(x?.userId) === id) === idx;
        }),
    [seenBy, senderId],
  );

  const groupRecipientIds = useMemo(
    () =>
      isGroupChat
        ? [
            ...new Set(
              (chatMembers || [])
                .map((member) => toIdString(member?._id || member?.id || member))
                .filter((id) => id && id !== toIdString(senderId)),
            ),
          ]
        : [],
    [isGroupChat, chatMembers, senderId],
  );

  const allGroupMembersSeen = useMemo(
    () =>
      isGroupChat
        ? groupRecipientIds.length > 0 && seenEntries.length >= groupRecipientIds.length
        : seenEntries.length > 0,
    [isGroupChat, groupRecipientIds.length, seenEntries.length],
  );

  if (isSystem)
    return (
      <div
        style={{
          textAlign: "center",
          padding: "6px 0",
          color: "var(--text-muted)",
          fontSize: 11,
        }}
      >
        <span
          style={{
            background: "var(--hover-bg)",
            padding: "3px 12px",
            borderRadius: 20,
          }}
        >
          {content}
        </span>
      </div>
    );

  return (
    <>
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => {
        if (isDeleted) return;
        e.preventDefault();
        setIsHovered(true);
        setShowMenu(true);
      }}
      style={{
        display: "flex",
        justifyContent: isMe ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 8,
        marginBottom: 2,
      }}
    >
      {/* Avatar — only for received messages */}
      {!isMe && (
        <Avatar
          name={senderVal?.name || "?"}
          module={senderVal?.module}
          size={30}
          style={{ alignSelf: "flex-end" }}
        />
      )}

      <div style={{ maxWidth: messageType === "poll" ? 360 : "72%" }}>
        {/* Sender name (group chats only) */}
        {!isMe && showSender && senderVal && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 2,
              marginLeft: 4,
              fontWeight: 600,
            }}
          >
            {senderVal.name}
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div
            style={{
              background: "var(--hover-bg)",
              borderLeft: "3px solid var(--navy)",
              padding: "4px 10px",
              borderRadius: "6px 6px 0 0",
              fontSize: 12,
              color: "var(--text-muted)",
              maxWidth: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {replyIsImage && (
              <img
                src={toMediaUrl(replyFileUrl, { disposition: "inline", filename: replyFileName || "image" })}
                alt="Reply preview"
                style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <span>↩ {replyPreviewText}</span>
          </div>
        )}

        {/* Bubble */}
        <div
          style={{
            padding: messageType === "poll" ? 0 : "10px 14px",
            borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            background: isMe ? "var(--message-mine)" : "var(--message-other)",
            color: isMe ? "var(--message-mine-text, #fff)" : "var(--message-other-text, var(--text-primary))",
            fontSize: 14,
            lineHeight: 1.6,
            border: isMe
              ? "1px solid var(--message-mine-border, rgba(255,255,255,0.08))"
              : "1px solid var(--message-other-border, var(--border))",
            boxShadow: isMe
              ? "0 4px 14px rgba(30, 58, 95, 0.18)"
              : "0 2px 8px rgba(15, 23, 42, 0.07)",
            wordBreak: "break-word",
            letterSpacing: "0.01em",
          }}
        >
          {isDeleted && (
            <span style={{ fontStyle: "italic", opacity: 0.6 }}>
              🚫 This message was deleted
            </span>
          )}

          {!isDeleted && messageType === "text" && (
            <>
              <span style={{ whiteSpace: "pre-wrap", display: "block" }}>
                {renderRichText(content)}
              </span>
            </>
          )}

          {!isDeleted && messageType === "image" && fileUrl && (
            <div>
              <img
                src={resolvedFileUrl}
                alt={fileName}
                onClick={() => {
                  setPreviewImageUrl(resolvedFileUrl);
                }}
                style={{
                  maxWidth: 280,
                  maxHeight: 240,
                  borderRadius: 8,
                  display: "block",
                  cursor: "pointer",
                  marginBottom: 0,
                }}
              />
            </div>
          )}

          {!isDeleted && messageType === "file" && fileUrl && !fileLooksLikeImage && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    background: isMe ? "rgba(255,255,255,0.15)" : "var(--border)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {getFileIcon(fileName)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{fileName}</div>
                </div>
                <a
                  href={resolvedDownloadFileUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: isMe ? "rgba(255,255,255,0.8)" : "var(--navy)",
                    fontSize: 18,
                    textDecoration: "none",
                    marginLeft: "auto",
                    flexShrink: 0,
                  }}
                >
                  ⬇️
                </a>
              </div>
            </div>
          )}

          {!isDeleted && messageType === "file" && fileUrl && fileLooksLikeImage && (
            <div>
              <img
                src={resolvedFileUrl}
                alt={fileName || "Image"}
                onClick={() => {
                  setPreviewImageUrl(resolvedFileUrl);
                }}
                style={{
                  maxWidth: 280,
                  maxHeight: 240,
                  borderRadius: 8,
                  display: "block",
                  cursor: "pointer",
                  marginBottom: 0,
                }}
              />
            </div>
          )}

          {!isDeleted && messageType === "voice" && voiceUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎙</span>
              <audio
                controls
                src={resolvedVoiceUrl}
                style={{ height: 32, maxWidth: 200 }}
              />
              {voiceDuration && (
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {Math.floor(voiceDuration / 60)}:
                  {String(voiceDuration % 60).padStart(2, "0")}
                </span>
              )}
            </div>
          )}

          {!isDeleted && messageType === "poll" && poll && (
            <PollMessage
              poll={poll}
              messageId={message._id}
              userId={currentUserId}
              onVote={onPollVote}
            />
          )}
        </div>

        {/* Reaction pills */}
        {Object.keys(grouped).length > 0 && !message._optimistic && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginTop: 4,
              flexWrap: "wrap",
              justifyContent: isMe ? "flex-end" : "flex-start",
            }}
          >
            {Object.entries(grouped).map(([emoji, count]) => {
              const reactors = validReactions.filter((r) => r.emoji === emoji);
              return (
                <span
                  key={emoji}
                  style={{ position: "relative", display: "inline-flex" }}
                  onMouseEnter={(e) => {
                    setSelectedEmojiReactions({ emoji, reactors });
                    if (count > 1) {
                      e.currentTarget.style.zIndex = 25;
                    }
                  }}
                  onMouseLeave={() => {
                    setSelectedEmojiReactions((prev) => (prev?.emoji === emoji ? null : prev));
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onReact?.(message._id, emoji)}
                    style={{
                      background:
                        myEmoji === emoji
                          ? "var(--accent-light)"
                          : "var(--hover-bg)",
                      border: `1px solid ${myEmoji === emoji ? "var(--accent-border)" : "var(--border)"}`,
                      borderRadius: 20,
                      padding: "2px 8px",
                      fontSize: 12,
                      cursor: "pointer",
                      userSelect: "none",
                      transition: "all 0.2s",
                      color: "var(--text-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {emoji}
                    {count > 1 ? ` ${count}` : ""}
                  </button>

                  {selectedEmojiReactions?.emoji === emoji && reactors.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 6px)",
                        left: isMe ? "auto" : 0,
                        right: isMe ? 0 : "auto",
                        minWidth: 190,
                        maxWidth: 280,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                        padding: 10,
                        zIndex: 2000,
                        color: "var(--text-primary)",
                        pointerEvents: "auto",
                      }}
                    >
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                        Reacted by
                      </div>
                      <div
                        style={{
                          maxHeight: `${MAX_LIST_VISIBLE_USERS * 22}px`,
                          overflowY: "auto",
                          paddingRight: 2,
                        }}
                      >
                        {reactors.map((reactor, idx) => {
                          const reactorName = getReactionUserName(reactor);
                          return (
                            <div
                              key={`${emoji}-${idx}`}
                              style={{
                                fontSize: 12,
                                lineHeight: 1.5,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "3px 0",
                              }}
                            >
                              <span
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: "var(--hover-bg)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "var(--text-muted)",
                                  flexShrink: 0,
                                }}
                              >
                                {(reactorName || "?").charAt(0).toUpperCase()}
                              </span>
                              <span>{reactorName}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Timestamp + seen + reaction bar */}
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 3,
            display: "flex",
            gap: 4,
            alignItems: "center",
            justifyContent: isMe ? "flex-end" : "flex-start",
            paddingInline: 4,
            minHeight: 18,
          }}
        >
          <span>{timeStr}</span>
          {isEdited && <span style={{ fontStyle: "italic", fontSize: 9 }}>(edited)</span>}
          {isMe && seenEntries.length > 0 && (
            <span
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginLeft: 4,
                cursor: "pointer",
                color: isGroupChat ? (allGroupMembersSeen ? "var(--accent)" : "var(--warning)") : "var(--accent)",
                fontWeight: 600,
              }}
              onMouseEnter={() => isGroupChat && setShowSeenBy(true)}
              onMouseLeave={() => isGroupChat && setShowSeenBy(false)}
              onClick={() => isGroupChat && setShowSeenBy((v) => !v)}
              title={isGroupChat ? "Seen by" : "Seen"}
            >
              <span style={{ fontSize: 11 }}>👁</span>
              <span style={{ fontSize: 10 }}>Seen</span>

              {isGroupChat && showSeenBy && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 200,
                    maxWidth: 280,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                    padding: 10,
                    zIndex: 2000,
                    color: "var(--text-primary)",
                  }}
                >
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                    Seen by
                  </div>
                  <div
                    style={{
                      maxHeight: `${MAX_LIST_VISIBLE_USERS * 22}px`,
                      overflowY: "auto",
                      paddingRight: 2,
                    }}
                  >
                    {seenEntries.map((entry) => (
                      <div
                        key={toIdString(entry.userId)}
                        style={{
                          fontSize: 12,
                          lineHeight: 1.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "3px 0",
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "var(--hover-bg)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            flexShrink: 0,
                          }}
                        >
                          {(getSeenUserName(entry) || "?").charAt(0).toUpperCase()}
                        </span>
                        <span>{getSeenUserName(entry)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </span>
          )}

          {/* Quick reactions (hidden until hover) */}
          {!isDeleted && !message._optimistic && (
            <span
              style={{
                display: "flex",
                gap: 2,
                marginLeft: 4,
                opacity: isHovered || showMenu ? 1 : 0,
                transition: "opacity 0.2s",
                pointerEvents: isHovered || showMenu ? "auto" : "none",
              }}
            >
              {ALLOWED_EMOJIS.map((e) => (
                <span
                  key={e}
                  onClick={() => onReact?.(message._id, e)}
                  title={e}
                  style={{ cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                >
                  {e}
                </span>
              ))}
              <div ref={menuRef} style={{ position: "relative", marginLeft: 6 }}>
                <button
                  onClick={() => setShowMenu((v) => !v)}
                  title="More"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ⋮
                </button>
                {showMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 0,
                      minWidth: 160,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
                      zIndex: 20,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onReply?.(message);
                      }}
                      style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", textAlign: "left", color: "var(--text-primary)" }}
                    >
                      ↩ Reply
                    </button>
                    {isMe && messageType === "text" && (() => {
                      const messageTime = new Date(createdAt).getTime();
                      const now = Date.now();
                      const minutesElapsed = (now - messageTime) / 1000 / 60;
                      const canEdit = minutesElapsed <= 60;
                      return canEdit ? (
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            onEdit?.(message);
                          }}
                          style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", textAlign: "left", color: "var(--text-primary)" }}
                        >
                          ✏️ Edit
                        </button>
                      ) : null;
                    })()}
                    {!isMe && isGroupChat && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onReplyPrivately?.(message._id);
                        }}
                        style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", textAlign: "left", color: "var(--text-primary)" }}
                      >
                        💬 Reply Privately
                      </button>
                    )}
                    {isMe && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onDelete?.(message._id);
                        }}
                        style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", textAlign: "left", color: "#EF4444" }}
                      >
                        🗑️ Delete
                      </button>
                    )}
                    {!isMe && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          const handleReport = async () => {
                            try {
                              const response = await reportMessage(message._id);
                              if (response?.data?.success) {
                                alert("Report submitted — pending admin review.");
                              } else {
                                alert("Failed to submit report");
                              }
                            } catch (err) {
                              if (err.response?.status === 401) {
                                alert("Unauthorized. Please login again.");
                              } else if (err.response?.status === 409) {
                                alert(err.response?.data?.error || "You have already reported this user. Awaiting admin review.");
                              } else {
                                alert("Error: " + (err.response?.data?.error || err.message));
                              }
                            }
                          };
                          handleReport();
                        }}
                        style={{ width: "100%", padding: "9px 12px", border: "none", background: "transparent", textAlign: "left", color: "#EF4444" }}
                      >
                        ⚠️ Report Message
                      </button>
                    )}
                  </div>
                )}
              </div>
            </span>
          )}
        </div>
      </div>
    </div>
    {previewImageUrl && (
      <div
        onClick={() => setPreviewImageUrl("")}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <img
          src={previewImageUrl}
          alt="Preview"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "95vw",
            maxHeight: "90vh",
            borderRadius: 12,
            boxShadow: "0 10px 36px rgba(0,0,0,0.45)",
            objectFit: "contain",
            background: "#111",
          }}
        />
      </div>
    )}
    {false && selectedEmojiReactions && (
      <div
        onClick={() => setSelectedEmojiReactions(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1999,
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
            padding: "20px",
            maxWidth: 360,
            maxHeight: "80vh",
            overflow: "auto",
            boxShadow: "0 10px 36px rgba(0,0,0,0.3)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>{selectedEmojiReactions.emoji}</span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
              {selectedEmojiReactions.reactors.length} {selectedEmojiReactions.reactors.length === 1 ? "reaction" : "reactions"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedEmojiReactions.reactors.map((reactor, idx) => {
              const reactorName =
                typeof reactor.userId === "object"
                  ? reactor.userId?.name || "Unknown"
                  : reactor.userName || "Unknown";
              return (
                <div
                  key={idx}
                  style={{
                    padding: "10px 12px",
                    background: "var(--hover-bg)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                >
                  {reactorName}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.isMe === nextProps.isMe &&
    prevProps.showSender === nextProps.showSender &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.onReact === nextProps.onReact &&
    prevProps.onPollVote === nextProps.onPollVote &&
    prevProps.onReply === nextProps.onReply &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onReplyPrivately === nextProps.onReplyPrivately &&
    prevProps.onMentionClick === nextProps.onMentionClick &&
    prevProps.isGroupChat === nextProps.isGroupChat &&
    prevProps.chatId === nextProps.chatId &&
    prevProps.chatMembers === nextProps.chatMembers
  );
};

export default memo(MessageBubble, areEqual);
