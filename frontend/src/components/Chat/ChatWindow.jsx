import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import Avatar from "../common/Avatar";
import ChatLoader from "../common/ChatLoader";
import { getModuleColor } from "../common/Avatar";
import { useMessages } from "../../hooks/useMessages";
import { votePoll, deleteOrLeaveChat, deleteGroupChat, addMemberToChat, removeMemberFromChat, getUsers, getUserById, editMessage, deleteMessage, addReaction, removeReaction, markSeen, replyPrivately, markChatAsSeen } from "../../api";
import { normalizeEmoji, isValidEmoji, ALLOWED_EMOJIS } from "../../utils/emojiNormalizer";

const toSafeDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
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

const POLL_VOTE_DEBOUNCE_MS = 350;
const EMPTY_MEMBERS = [];

const getPollUserVoteIndex = (poll, userId) => {
  const vote = (poll?.voters || []).find(
    (v) => toIdString(v.userId) === toIdString(userId),
  );
  return vote?.optionIndex ?? null;
};

const buildOptimisticPollVote = (poll, userId, nextVote) => {
  if (!poll || !Array.isArray(poll.options)) return poll;

  const prevVote = getPollUserVoteIndex(poll, userId);
  if (prevVote === nextVote) return poll;

  if (
    nextVote !== null &&
    (nextVote < 0 || nextVote >= poll.options.length)
  ) {
    return poll;
  }

  const prevUserVote = (poll.voters || []).find(
    (v) => toIdString(v.userId) === toIdString(userId),
  );

  const votersWithoutMe = (poll.voters || []).filter(
    (v) => toIdString(v.userId) !== toIdString(userId),
  );

  const voters =
    nextVote === null
      ? votersWithoutMe
      : [
          ...votersWithoutMe,
          {
            userId: prevUserVote?.userId || userId,
            optionIndex: nextVote,
          },
        ];

  const options = poll.options.map((opt, i) => {
    let votes = Number(opt?.votes || 0);
    if (prevVote !== null && prevVote === i) votes -= 1;
    if (nextVote !== null && nextVote === i) votes += 1;
    return { ...opt, votes: Math.max(0, votes) };
  });

  return { ...poll, options, voters };
};

// Helper function to get date separator label
const getDateLabel = (date) => {
  const today = new Date();
  const messageDate = toSafeDate(date);
  
  // Reset time to compare only dates
  today.setHours(0, 0, 0, 0);
  messageDate.setHours(0, 0, 0, 0);
  
  const diffTime = today - messageDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  
  // Format as "Month Day, Year"
  return messageDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

// Check if date separator should be shown
const shouldShowDateSeparator = (currentMsg, prevMsg) => {
  if (!prevMsg) return true; // Always show for first message
  
  const currentDate = toSafeDate(currentMsg?.createdAt);
  const prevDate = toSafeDate(prevMsg?.createdAt);
  
  // Compare dates (ignore time)
  return currentDate.toDateString() !== prevDate.toDateString();
};

const humanizeRole = (role) => {
  if (!role) return "—";
  return String(role)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatLastActive = (lastSeen) => {
  if (!lastSeen) return "Never active";
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ChatWindow({
  chat,
  currentUser,
  socket,
  onNewMessage,
  onChatUpdate,
  onSelectChat,
  onBack,
  isMobile,
  onStartDM,
  onNewGroup,
}) {
  const { messages, loading, hasMore, addMessage, updateMessage, removeMessage, loadMore } = useMessages(
    chat?._id,
  );

  const [typingUsers, setTypingUsers] = useState({}); // { [userId]: userName }
  const [replyTo, setReplyTo] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false);
  const [selectedUsersToRemove, setSelectedUsersToRemove] = useState([]);
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState([]);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [removeMemberSearch, setRemoveMemberSearch] = useState("");
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loadingAvailableUsers, setLoadingAvailableUsers] = useState(false);
  const [liveChat, setLiveChat] = useState(null); // Track real-time chat updates (members, etc)
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [mentionProfile, setMentionProfile] = useState(null);
  const [mentionProfileLoading, setMentionProfileLoading] = useState(false);
  const [mentionProfileError, setMentionProfileError] = useState("");
  const [isWindowActive, setIsWindowActive] = useState(
    typeof document !== "undefined"
      ? document.visibilityState === "visible" && document.hasFocus()
      : true,
  );
  const endRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const previousDisplayCountRef = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const messageCounterRef = useRef(0);

  // Always-fresh refs so socket callbacks never go stale
  const addMessageRef = useRef(addMessage);
  const updateMessageRef = useRef(updateMessage);
  const chatIdRef = useRef(chat?._id);
  const currentUserRef = useRef(currentUser);
  const messagesRef = useRef(messages);
  const onSelectChatRef = useRef(onSelectChat);
  const chatMembersRef = useRef((chat?.members || EMPTY_MEMBERS));
  const seenInFlightRef = useRef(new Set());
  const pollVoteSyncRef = useRef(new Map());
  const pollVoteRequestSeqRef = useRef(0);

  useEffect(() => {
    addMessageRef.current = addMessage;
  }, [addMessage]);
  useEffect(() => {
    updateMessageRef.current = updateMessage;
  }, [updateMessage]);
  useEffect(() => {
    chatIdRef.current = chat?._id;
  }, [chat?._id]);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    onSelectChatRef.current = onSelectChat;
  }, [onSelectChat]);
  useEffect(() => {
    chatMembersRef.current = (liveChat || chat)?.members || EMPTY_MEMBERS;
  }, [liveChat, chat]);

  useEffect(() => {
    return () => {
      pollVoteSyncRef.current.forEach((entry) => {
        if (entry?.timerId) clearTimeout(entry.timerId);
      });
      pollVoteSyncRef.current.clear();
    };
  }, []);

  const persistPollVote = async (messageId) => {
    const entry = pollVoteSyncRef.current.get(messageId);
    if (!entry) return;

    const optionIndex = entry.latestVote;
    const requestSeq = ++pollVoteRequestSeqRef.current;
    entry.inFlight = true;
    entry.inFlightVote = optionIndex;
    entry.requestSeq = requestSeq;
    pollVoteSyncRef.current.set(messageId, entry);

    try {
      const response = await votePoll(messageId, {
        userId: currentUserRef.current?._id,
        optionIndex,
      });

      const current = pollVoteSyncRef.current.get(messageId);
      if (!current || current.requestSeq !== requestSeq) return;

      current.inFlight = false;

      const hasNewerIntent =
        !!current.timerId || current.latestVote !== optionIndex;
      if (hasNewerIntent) {
        pollVoteSyncRef.current.set(messageId, current);
        return;
      }

      const backendPoll = response?.data?.data;
      if (backendPoll) {
        updateMessageRef.current({ _id: messageId, poll: backendPoll });
      }

      pollVoteSyncRef.current.delete(messageId);
    } catch (err) {
      const current = pollVoteSyncRef.current.get(messageId);
      if (!current || current.requestSeq !== requestSeq) return;

      current.inFlight = false;

      const hasNewerIntent =
        !!current.timerId || current.latestVote !== optionIndex;
      if (hasNewerIntent) {
        pollVoteSyncRef.current.set(messageId, current);
        return;
      }

      if (current.basePoll) {
        updateMessageRef.current({ _id: messageId, poll: current.basePoll });
      }

      pollVoteSyncRef.current.delete(messageId);
      setAlertMessage(err?.response?.data?.error || err.message || "Failed to update poll vote");
      setShowAlert(true);
    }
  };

  const schedulePollVotePersist = (messageId) => {
    const entry = pollVoteSyncRef.current.get(messageId);
    if (!entry) return;

    if (entry.timerId) clearTimeout(entry.timerId);

    entry.timerId = setTimeout(() => {
      const latest = pollVoteSyncRef.current.get(messageId);
      if (!latest) return;
      latest.timerId = null;
      pollVoteSyncRef.current.set(messageId, latest);
      persistPollVote(messageId);
    }, POLL_VOTE_DEBOUNCE_MS);

    pollVoteSyncRef.current.set(messageId, entry);
  };

  const stableChatMembers = useMemo(
    () => (liveChat || chat)?.members || EMPTY_MEMBERS,
    [liveChat, chat],
  );
  const resolvedChat = liveChat || chat;
  const isCurrentUserActiveGroupMember = useMemo(() => {
    if (!resolvedChat?.isGroup) return true;
    const currentId = toIdString(currentUser?._id || currentUser);
    return stableChatMembers.some((m) => toIdString(m?._id || m) === currentId);
  }, [resolvedChat?.isGroup, stableChatMembers, currentUser]);
  const groupInteractionDisabledReason = resolvedChat?.isGroup && !isCurrentUserActiveGroupMember
    ? "You are no longer a member of this group"
    : "";

  useEffect(() => {
    const updateWindowActive = () => {
      setIsWindowActive(document.visibilityState === "visible" && document.hasFocus());
    };

    document.addEventListener("visibilitychange", updateWindowActive);
    window.addEventListener("focus", updateWindowActive);
    window.addEventListener("blur", updateWindowActive);

    return () => {
      document.removeEventListener("visibilitychange", updateWindowActive);
      window.removeEventListener("focus", updateWindowActive);
      window.removeEventListener("blur", updateWindowActive);
    };
  }, []);

  // Initialize liveChat when chat prop changes
  useEffect(() => {
    setLiveChat(chat);
  }, [chat]);

  useEffect(() => {
    previousDisplayCountRef.current = 0;
  }, [chat?._id]);

  // Notify parent when liveChat members change (for real-time member updates)
  // Only update if members array has actually changed
  useEffect(() => {
    if (!liveChat || !onChatUpdate || !liveChat.isGroup || !chat) return;
    
    // Only notify if this is a group and members have changed
    const memberIds = liveChat.members?.map(m => m._id || m).sort().join(',');
    const prevMemberIds = chat.members?.map(m => m._id || m).sort().join(',');
    
    if (memberIds !== prevMemberIds) {
      onChatUpdate(liveChat);
    }
  }, [liveChat?.members?.length, onChatUpdate, liveChat?.isGroup]);


  // Infinite scroll: Load more messages when scrolling to top
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = async () => {
      // Check if scrolled to top (with small threshold)
      if (container.scrollTop < 100 && hasMore && !loading && !loadingMore) {
        setLoadingMore(true);
        
        // Save current scroll height to restore position after loading
        const previousScrollHeight = container.scrollHeight;
        
        // Load more messages
        await loadMore();
        
        // Restore scroll position after new messages are added
        setTimeout(() => {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - previousScrollHeight;
          setLoadingMore(false);
        }, 100);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, loadingMore, loadMore]);

  useEffect(() => {
    const previousCount = previousDisplayCountRef.current;
    const hasNewMessage = messages.length > previousCount;
    previousDisplayCountRef.current = messages.length;

    if (!hasNewMessage) return;

    const container = messagesContainerRef.current;
    const isNearBottom = !container
      ? true
      : (container.scrollHeight - container.scrollTop - container.clientHeight) < 140;

    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Mark messages as seen ONLY when they are actually visible in viewport
  useEffect(() => {
    const isOverlayOpen =
      !!mentionProfile ||
      showSettings ||
      showGroupSettings ||
      showConfirmModal ||
      showAddMemberModal ||
      showRemoveMemberModal ||
      showEditModal;

    if (!chat?._id || !currentUser?._id || !messages.length || !isWindowActive || isOverlayOpen) return;

    const container = messagesContainerRef.current;
    if (!container) return;
    const activeChatId = chat._id;

    const markVisibleMessageSeen = async (messageId) => {
      if (!messageId || seenInFlightRef.current.has(messageId)) return;
      if (chatIdRef.current !== activeChatId) return;
      if (!isWindowActive) return;

      const msg = messagesRef.current.find((m) => m._id === messageId);
      if (!msg) return;

      const senderId = toIdString(msg.senderId);
      const isMyMessage = senderId === currentUser._id;
      const isAiMessage = msg.messageType === "ai" || msg.metadata?.systemSubtype === "ai";
      const isSystemLike = (msg.messageType === "system" || msg.type === "system") && !isAiMessage;
      const alreadySeen = (msg.seenBy || []).some(
        (s) => toIdString(s.userId) === currentUser._id,
      );

      if (isMyMessage || isSystemLike || alreadySeen) return;

      seenInFlightRef.current.add(messageId);
      try {
        const res = await markSeen(messageId, currentUser._id);
        if (chatIdRef.current !== activeChatId) return;

        const seenAt = res?.data?.data?.seenAt || new Date();

        updateMessageRef.current((m) => {
          if (m._id !== messageId) return m;
          const exists = (m.seenBy || []).some(
            (s) => toIdString(s.userId) === currentUser._id,
          );
          if (exists) return m;
          return {
            ...m,
            seenBy: [...(m.seenBy || []), { userId: currentUser._id, seenAt }],
          };
        });

        socket?.emit("mark_seen", {
          messageId,
          userId: currentUser._id,
          chatId: activeChatId,
        });
      } catch (err) {
        // ignore transient errors
      } finally {
        seenInFlightRef.current.delete(messageId);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.7) return;
          const messageId = entry.target.getAttribute("data-message-id");
          markVisibleMessageSeen(messageId);
        });
      },
      {
        root: container,
        threshold: [0.7],
      },
    );

    const nodes = container.querySelectorAll("[data-message-id]");
    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [
    chat?._id,
    messages,
    currentUser?._id,
    socket,
    isWindowActive,
    mentionProfile,
    showSettings,
    showGroupSettings,
    showConfirmModal,
    showAddMemberModal,
    showRemoveMemberModal,
    showEditModal,
  ]);

  useEffect(() => {
    if (!chat?._id || !currentUser?._id) return;
    markChatAsSeen(chat._id, currentUser._id).catch(() => {
      // Individual visible-message seen tracking will still run.
    });
  }, [chat?._id, currentUser?._id]);

  // ── Socket listeners ──────────────────────────────────────────
  useEffect(() => {
    if (!socket || !chat?._id) return;

    // Reset typing indicators and reply state on chat change
    setTypingUsers({});
    setReplyTo(null);

    socket.emit("join_chat", { chatId: chat._id, userId: currentUser._id });

    const onMessage = (msg) => {
      const msgChatId = msg.chatId?._id || msg.chatId;
      if (msgChatId !== chatIdRef.current) return;
      addMessageRef.current(msg);
      onNewMessage?.(msg);
    };

    const onTyping = ({ userId, userName, isTyping }) => {
      if (userId === currentUserRef.current._id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[userId] = userName;
        else delete next[userId];
        return next;
      });
    };

    const onReaction = ({ messageId, reactions }) => {
      // Don't normalize - keep original emoji as received from backend
      updateMessageRef.current({ _id: messageId, reactions });
    };

    const onMessageDeleted = ({ messageId }) => {
      removeMessage(messageId);
    };

    const onPoll = ({ messageId, poll }) => {
      const pending = pollVoteSyncRef.current.get(messageId);
      const hasUnsyncedLocalVote =
        !!pending?.timerId || (pending?.inFlight && pending?.latestVote !== pending?.inFlightVote);

      if (hasUnsyncedLocalVote) return;

      if (pending) pollVoteSyncRef.current.delete(messageId);
      updateMessageRef.current({ _id: messageId, poll });
    };

    const onSeen = ({ messageId, userId, seenAt }) => {
      updateMessageRef.current((m) => {
        if (m._id !== messageId) return m;
        const already = (m.seenBy || []).some(
          (s) => (s.userId?._id || s.userId) === userId,
        );
        if (already) return m;
        return { ...m, seenBy: [...(m.seenBy || []), { userId, seenAt }] };
      });
    };

    // Handle message edits from other users
    const onMessageEdited = ({ messageId, content, isEdited, seenBy, editedAt }) => {
      updateMessageRef.current({ _id: messageId, content, isEdited, seenBy: seenBy || [], editedAt });
    };

    // Handle chat updates (member additions/removals)
    const onChatUpdated = ({ chatId, members }) => {
      if (chatId !== chatIdRef.current) return;
      setLiveChat((prev) => ({
        ...prev,
        members: members || prev?.members,
      }));
    };

    const onRemovedFromChat = ({ chatId }) => {
      if (chatId !== chatIdRef.current) return;
      setLiveChat((prev) => {
        if (!prev) return prev;
        const currentId = toIdString(currentUserRef.current?._id);
        const nextMembers = (prev.members || []).filter(
          (m) => toIdString(m?._id || m) !== currentId,
        );
        return {
          ...prev,
          members: nextMembers,
          isRemovedFromGroup: true,
        };
      });
      setShowAddMemberModal(false);
      setShowRemoveMemberModal(false);
      setShowGroupSettings(false);
    };

    socket.on("receive_message", onMessage);
    socket.on("typing_status", onTyping);
    socket.on("reaction_updated", onReaction);
    socket.on("reaction_added", onReaction);
    socket.on("poll_updated", onPoll);
    socket.on("message_seen", onSeen);
    socket.on("message_deleted", onMessageDeleted);
    socket.on("message_edited", onMessageEdited);
    socket.on("chat_updated", onChatUpdated);
    socket.on("removed_from_chat", onRemovedFromChat);

    return () => {
      socket.off("receive_message", onMessage);
      socket.off("typing_status", onTyping);
      socket.off("reaction_updated", onReaction);
      socket.off("reaction_added", onReaction);
      socket.off("poll_updated", onPoll);
      socket.off("message_seen", onSeen);
      socket.off("message_deleted", onMessageDeleted);
      socket.off("message_edited", onMessageEdited);
      socket.off("chat_updated", onChatUpdated);
      socket.off("removed_from_chat", onRemovedFromChat);
      socket.emit("leave_chat", { chatId: chat._id });
    };
  }, [socket, chat?._id, removeMessage]);

  // ── Send handlers ─────────────────────────────────────────────
  const handleSendText = async (text, replyToId) => {
    if (chat?.isGroup && !isCurrentUserActiveGroupMember) {
      setAlertMessage("You are no longer a member of this group");
      setShowAlert(true);
      return;
    }

    // Optimistic: show message immediately with correct createdAt
    messageCounterRef.current++;
    const optimistic = {
      _id: "opt-" + Date.now() + "-" + messageCounterRef.current,
      chatId: chat._id,
      senderId: currentUser, // full object — no "?" avatar
      messageType: "text",
      content: text,
      replyTo: replyToId ? { _id: replyToId } : null,
      seenBy: [],
      reactions: [],
      createdAt: new Date().toISOString(), // valid ISO string — no "Invalid Date"
      _optimistic: true,
    };
    addMessageRef.current(optimistic);

    socket?.emit("send_message", {
      chatId: chat._id,
      senderId: currentUser._id,
      messageType: "text",
      content: text,
      replyTo: replyToId || null,
    });
  };

  const handleFileSent = (msg) => {
    if (chat?.isGroup && !isCurrentUserActiveGroupMember) return;
    const normalizedMsg = {
      ...msg,
      createdAt: msg?.createdAt || new Date().toISOString(),
    };
    addMessageRef.current(normalizedMsg);
    setReplyTo(null);
    onNewMessage?.(normalizedMsg);
  };
  const handleVoiceSent = (msg) => {
    if (chat?.isGroup && !isCurrentUserActiveGroupMember) return;
    const normalizedMsg = {
      ...msg,
      createdAt: msg?.createdAt || new Date().toISOString(),
    };
    addMessageRef.current(normalizedMsg);
    setReplyTo(null);
    onNewMessage?.(normalizedMsg);
  };
  const handlePollCreated = (msg) => {
    if (chat?.isGroup && !isCurrentUserActiveGroupMember) return;
    const normalizedMsg = {
      ...(msg?.data || msg),
      createdAt: (msg?.data || msg)?.createdAt || new Date().toISOString(),
    };
    addMessageRef.current(normalizedMsg);
    setReplyTo(null);
    onNewMessage?.(normalizedMsg);
  };

  // Handle delete chat for current user
  const handleDeleteChat = async () => {
    setConfirmAction("delete");
    setShowConfirmModal(true);
  };

  const executeDeleteChat = async () => {
    try {
      await deleteOrLeaveChat(chat._id, currentUser._id);
      setShowConfirmModal(false);
      onBack?.();
    } catch (err) {
      setAlertMessage("Failed to delete chat: " + err.message);
      setShowAlert(true);
    }
  };

  // Fetch available users when add member modal opens
  useEffect(() => {
    if (showAddMemberModal && chat?.isGroup) {
      fetchAvailableUsers();
    }
  }, [showAddMemberModal, chat?.isGroup, chat?.members]);

  useEffect(() => {
    if (!showAddMemberModal) {
      setSelectedUsersToAdd([]);
      setAddMemberSearch("");
    }
  }, [showAddMemberModal]);

  useEffect(() => {
    if (!showRemoveMemberModal) {
      setSelectedUsersToRemove([]);
      setRemoveMemberSearch("");
    }
  }, [showRemoveMemberModal]);

  // Fetch available users for add member modal
  const fetchAvailableUsers = async () => {
    try {
      setLoadingAvailableUsers(true);
      const response = await getUsers();
      const users = response.data.data || response.data;
      // Filter out current user and members already in the group
      const memberIds = chat.members.map(m => m._id);
      const filtered = users.filter(u => u._id !== currentUser._id && !memberIds.includes(u._id));
      setAvailableUsers(filtered);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setAlertMessage("Failed to load available users");
      setShowAlert(true);
    } finally {
      setLoadingAvailableUsers(false);
    }
  };

  // Group Chat Handlers
  const handleAddMember = async () => {
    if (!isCurrentUserActiveGroupMember) {
      setAlertMessage("You are no longer a member of this group");
      setShowAlert(true);
      return;
    }

    if (!selectedUsersToAdd.length) {
      setAlertMessage("Please select at least one user to add");
      setShowAlert(true);
      return;
    }
    
    // Check 250 member limit
    const currentMemberCount = (liveChat || chat)?.members?.length || 0;
    if (currentMemberCount >= 250 || currentMemberCount + selectedUsersToAdd.length > 250) {
      setAlertMessage("Cannot add member: Group has reached maximum size of 250 members");
      setShowAlert(true);
      return;
    }
    
    try {
      await Promise.all(
        selectedUsersToAdd.map((userId) => addMemberToChat(chat._id, userId))
      );
      setAlertMessage(`${selectedUsersToAdd.length} member${selectedUsersToAdd.length > 1 ? "s" : ""} added to the group`);
      setShowAlert(true);
      setShowAddMemberModal(false);
      setSelectedUsersToAdd([]);
    } catch (err) {
      setAlertMessage("Failed to add member: " + err.message);
      setShowAlert(true);
    }
  };

  const handleRemoveMember = async () => {
    if (!isCurrentUserActiveGroupMember) {
      setAlertMessage("You are no longer a member of this group");
      setShowAlert(true);
      return;
    }

    if (!selectedUsersToRemove.length) {
      setAlertMessage("Please select at least one member to remove");
      setShowAlert(true);
      return;
    }
    // Prevent removing the group admin/creator
    const adminId = (liveChat || chat)?.createdBy?._id || (liveChat || chat)?.createdBy;
    if (selectedUsersToRemove.some((id) => id === String(adminId))) {
      setAlertMessage("Cannot remove the group admin (creator)");
      setShowAlert(true);
      return;
    }
    try {
      await Promise.all(
        selectedUsersToRemove.map((userId) => removeMemberFromChat(chat._id, userId))
      );
      setAlertMessage(`${selectedUsersToRemove.length} member${selectedUsersToRemove.length > 1 ? "s" : ""} removed from the group`);
      setShowAlert(true);
      setShowRemoveMemberModal(false);
      setSelectedUsersToRemove([]);
    } catch (err) {
      setAlertMessage("Failed to remove member: " + err.message);
      setShowAlert(true);
    }
  };

  const toggleAddSelection = (userId) => {
    setSelectedUsersToAdd((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleRemoveSelection = (userId) => {
    setSelectedUsersToRemove((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredAvailableUsers = availableUsers.filter((user) => {
    const q = addMemberSearch.trim().toLowerCase();
    if (!q) return true;
    return [user.name, user.email, user.designation, user.module]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const removableMembers = ((liveChat || chat)?.members || [])
    .filter((member) => String(member?._id) !== String(currentUser?._id))
    .filter((member) => {
      const q = removeMemberSearch.trim().toLowerCase();
      if (!q) return true;
      return [member.name, member.email, member.designation, member.module]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

  const isGroupCreator = useMemo(() => {
    if (!resolvedChat?.isGroup) return false;
    const creatorId = resolvedChat?.createdBy?._id || resolvedChat?.createdBy;
    return toIdString(creatorId) === toIdString(currentUser?._id || currentUser);
  }, [resolvedChat, currentUser]);
  const canDeleteGroup = isGroupCreator || currentUser?.role === "admin";

  const handleDeleteGroup = async () => {
    try {
      if (canDeleteGroup) {
        await deleteGroupChat(chat._id, currentUser._id);
      } else {
        await deleteOrLeaveChat(chat._id, currentUser._id);
      }
      setShowConfirmModal(false);
      onBack?.();
    } catch (err) {
      const message = err?.response?.data?.error || err.message;
      setAlertMessage((canDeleteGroup ? "Failed to delete group: " : "Failed to leave group: ") + message);
      setShowAlert(true);
    }
  };

  const handleEditMessage = useCallback((message) => {
    setEditingMessage(message);
    setEditText(message.content);
    setShowEditModal(true);
  }, []);

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText.length > 1000) {
      setAlertMessage(editText.length > 1000 ? "Message must be under 1000 characters" : "Message cannot be empty");
      setShowAlert(true);
      return;
    }
    try {
      await editMessage(editingMessage._id, { 
        content: editText, 
        userId: currentUser._id 
      });
      updateMessage({ _id: editingMessage._id, content: editText, isEdited: true, seenBy: [] });
      setShowEditModal(false);
      setEditingMessage(null);
      setEditText("");
      setAlertMessage("Message edited successfully");
      setShowAlert(true);
    } catch (err) {
      setAlertMessage("Failed to edit message: " + (err.response?.data?.error || err.message));
      setShowAlert(true);
    }
  };

  const handleDeleteMessage = useCallback(async (messageId) => {
    if (!confirm("Delete this message for yourself?")) return;
    try {
      await deleteMessage(messageId, currentUserRef.current?._id);
      removeMessage(messageId);
      setAlertMessage("Message deleted");
      setShowAlert(true);
    } catch (err) {
      setAlertMessage("Failed to delete message: " + err.message);
      setShowAlert(true);
    }
  }, [removeMessage]);

  // Handle quick prompts from sidebar

  useEffect(() => {
    if (!chat?.__privateReplyContext) return;
    const ctx = chat.__privateReplyContext;
    setReplyTo({
      _id: ctx._id,
      content: ctx.content,
      messageType: ctx.messageType || ctx.type,
      poll: (ctx.messageType || ctx.type) === "poll" ? { question: ctx.metadata?.question || "Poll" } : null,
      metadata: ctx.metadata || {},
    });
  }, [chat?._id, chat?.__privateReplyContext]);

  // Reaction — optimistically update local state immediately, then sync
  const handleReact = useCallback(async (messageId, emoji) => {
    if (!chatIdRef.current) return;
    
    // Validate emoji but send original
    if (!isValidEmoji(emoji)) {
      console.warn("Invalid emoji attempted:", emoji);
      return;
    }

    const msg = messagesRef.current.find((m) => m._id === messageId);
    if (!msg) return;

    const currentUserId = currentUserRef.current?._id;
    if (!currentUserId) return;

    const existingReaction = (msg?.reactions || []).find(
      (r) => r.userId === currentUserId || r.userId?._id === currentUserId,
    );

    // Compare using normalized emoji
    const isRemoving = existingReaction && normalizeEmoji(existingReaction.emoji) === normalizeEmoji(emoji);
    
    // Optimistic update - keep original emoji
    const updatedReactions = isRemoving
      ? (msg.reactions || []).filter(r => (r.userId?._id || r.userId) !== currentUserId)
      : (msg.reactions || []).filter(r => (r.userId?._id || r.userId) !== currentUserId).concat({
          userId: currentUserId,
          emoji,
        });
    
    updateMessageRef.current({ _id: messageId, reactions: updatedReactions });

    // Async API call
    try {
      if (isRemoving) {
        await removeReaction({ messageId, userId: currentUserId });
      } else {
        await addReaction({ messageId, userId: currentUserId, emoji });
      }
    } catch (err) {
      // Revert on error
      updateMessageRef.current({ _id: messageId, reactions: msg.reactions || [] });
    }
  }, []);

  const handlePollVote = useCallback((messageId, optionIndex) => {
    const message = messagesRef.current.find((m) => m._id === messageId);
    const currentPoll = message?.poll;
    if (!currentPoll) return;

    const currentUserId = currentUserRef.current?._id;
    if (!currentUserId) return;

    const optimisticPoll = buildOptimisticPollVote(
      currentPoll,
      currentUserId,
      optionIndex,
    );

    if (optimisticPoll === currentPoll) return;

    updateMessageRef.current({ _id: messageId, poll: optimisticPoll });

    const existing = pollVoteSyncRef.current.get(messageId);
    const nextState = existing
      ? {
          ...existing,
          latestVote: optionIndex,
          basePoll: existing.basePoll || currentPoll,
        }
      : {
          basePoll: currentPoll,
          latestVote: optionIndex,
          timerId: null,
          inFlight: false,
          inFlightVote: null,
          requestSeq: 0,
        };

    pollVoteSyncRef.current.set(messageId, nextState);
    schedulePollVotePersist(messageId);
  }, []);

  const handleReplyPrivately = useCallback(async (messageId) => {
    try {
      const message = messagesRef.current.find(m => m._id === messageId);
      if (!message?.senderId) {
        throw new Error("Invalid message");
      }

      const response = await replyPrivately(messageId);
      const privateChat = response?.data?.data?.chat;
      const messageContext = response?.data?.data?.messageContext;
      
      if (!privateChat?._id) {
        throw new Error("Failed to get chat");
      }
      
      onSelectChatRef.current?.({
        ...privateChat,
        __privateReplyContext: messageContext
          ? {
              _id: messageContext._id,
              content: messageContext.content,
              type: messageContext.type,
              messageType: messageContext.messageType || messageContext.type,
              metadata: messageContext.metadata || {},
            }
          : null,
      });
    } catch (err) {
      setAlertMessage(err.message);
      setShowAlert(true);
    }
  }, []);

  const handleMentionClick = useCallback((mentionName) => {
    const members = chatMembersRef.current;
    const target = members.find((m) =>
      (m.name || "").toLowerCase().replace(/\s+/g, "") === mentionName.toLowerCase().replace(/\s+/g, ""),
    ) || members.find((m) => (m.name || "").toLowerCase().includes(mentionName.toLowerCase()));

    if (target) {
      setMentionProfileError("");
      setMentionProfile(target);

      const targetId = toIdString(target?._id || target?.id || target);
      if (!targetId) return;

      setMentionProfileLoading(true);
      getUserById(targetId)
        .then((response) => {
          const details = response?.data?.data || response?.data;
          if (!details) return;

          setMentionProfile((prev) => {
            if (!prev) return prev;
            const prevId = toIdString(prev?._id || prev?.id || prev);
            if (prevId !== targetId) return prev;
            return { ...prev, ...details };
          });
        })
        .catch((err) => {
          setMentionProfileError(err?.response?.data?.error || err.message || "Failed to load full profile");
        })
        .finally(() => {
          setMentionProfileLoading(false);
        });
    }
  }, []);

  const closeMentionProfile = useCallback(() => {
    setMentionProfile(null);
    setMentionProfileError("");
    setMentionProfileLoading(false);
  }, []);

  // ── Render ────────────────────────────────────────────────────
  if (!chat)
    return (
      <div className="chat-empty-state">
        <div className="chat-empty-icon">
          <svg viewBox="0 0 24 24">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h3>Welcome to VibeConnect</h3>
        <p>
          Pick a conversation from the sidebar, or start a new one with a
          teammate right now.
        </p>
        <div className="empty-cta">
          <button className="empty-chip" onClick={onStartDM} style={{ cursor: "pointer", background: "var(--surface)", border: "1.5px solid var(--border)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Direct Message
          </button>
          <button className="empty-chip" onClick={onNewGroup} style={{ cursor: "pointer", background: "var(--surface)", border: "1.5px solid var(--border)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            New Group
          </button>
        </div>
      </div>
    );

  const chatMember = !chat.isGroup
    ? chat.members?.find((m) => m._id !== currentUser._id)
    : null;
  const chatName = chat.isGroup ? chat.name : chatMember?.name || "Chat";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: isMobile ? "10px 14px" : "12px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          background: "var(--surface)",
          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          {isMobile && (
            <button
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                fontSize: 20,
                color: "var(--navy)",
                padding: "0 4px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ←
            </button>
          )}
          {chat.isGroup ? (
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: getModuleColor(chat.module),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              }}
            >
              {chat.name?.slice(0, 2)}
            </div>
          ) : (
            <Avatar
              name={chatMember?.name || "??"}
              module={chatMember?.module}
              size={42}
              online={chatMember?.isOnline}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chatName}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: chatMember?.isOnline ? "#22C55E" : "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 1,
              }}
            >
              {chat.isGroup ? (
                <>
                  <span>{stableChatMembers.length || 0} members</span>
                </>
              ) : chatMember?.isOnline ? (
                <>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                  <span>Online</span>
                </>
              ) : (
                `Last seen ${
                  chatMember?.lastSeen
                    ? new Date(chatMember.lastSeen).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : "recently"
                }`
              )}
            </div>
          </div>
        </div>
        {!chat.isGroup && (
          <div style={{ position: "relative", flexShrink: 0, marginLeft: 8 }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: showSettings ? "var(--hover-bg)" : "none",
                border: "1px solid var(--border)",
                borderRadius: 9,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.18s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = showSettings ? "var(--hover-bg)" : "none")}
            >
              ⚙️
            </button>

            {/* Settings Menu */}
            {showSettings && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 1000,
                  minWidth: 200,
                  marginTop: 8,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    handleDeleteChat();
                    setShowSettings(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    background: "none",
                    textAlign: "left",
                    color: "#E53E3E",
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "background 0.2s",
                    borderTop: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.target.style.background = "none")}
                >
                  🗑️ Delete Chat
                </button>
              </div>
            )}
          </div>
        )}
        {chat.isGroup && isCurrentUserActiveGroupMember && (
          <div style={{ position: "relative", flexShrink: 0, marginLeft: 8 }}>
            <button
              onClick={() => setShowGroupSettings(!showGroupSettings)}
              style={{
                background: showGroupSettings ? "var(--hover-bg)" : "none",
                border: "1px solid var(--border)",
                borderRadius: 9,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 16,
                cursor: "pointer",
                transition: "all 0.18s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = showGroupSettings ? "var(--hover-bg)" : "none")}
            >
              ⚙️
            </button>

            {/* Group Settings Menu */}
            {showGroupSettings && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 1000,
                  minWidth: 200,
                  marginTop: 8,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowAddMemberModal(true);
                    setShowGroupSettings(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    background: "none",
                    textAlign: "left",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.target.style.background = "none")}
                >
                  ➕ Add Member
                </button>
                <button
                  onClick={() => {
                    setShowRemoveMemberModal(true);
                    setShowGroupSettings(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    background: "none",
                    textAlign: "left",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "background 0.2s",
                    borderTop: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.target.style.background = "none")}
                >
                  ➖ Remove Member
                </button>
                <button
                  onClick={() => {
                    setConfirmAction("deleteGroup");
                    setShowConfirmModal(true);
                    setShowGroupSettings(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    border: "none",
                    background: "none",
                    textAlign: "left",
                    color: "#E53E3E",
                    cursor: "pointer",
                    fontSize: 14,
                    transition: "background 0.2s",
                    borderTop: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.target.style.background = "none")}
                >
                  {canDeleteGroup ? "🗑️ Delete Chat" : "🚪 Leave Group"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          background: "var(--bg)",
        }}
      >
        {/* Loading more messages indicator */}
        {loadingMore && (
          <ChatLoader compact message="Loading older messages..." />
        )}

        {loading && (
          <ChatLoader compact message="Loading messages..." />
        )}

        {messages.map((msg, i) => {
          const senderId = toIdString(msg.senderId);
          const isMe = senderId === toIdString(currentUser);
          const prevId =
            i > 0
              ? toIdString(messages[i - 1].senderId)
              : null;
          const showSender = chat.isGroup && !isMe && senderId !== prevId;
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showDateSeparator = shouldShowDateSeparator(msg, prevMsg);

          return (
            <div key={msg._id} data-message-id={msg._id}>
              {/* Date Separator */}
              {showDateSeparator && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "16px 0 12px",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "var(--border)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "4px 12px",
                      background: "var(--surface)",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                    }}
                  >
                    {getDateLabel(msg.createdAt)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "var(--border)",
                    }}
                  />
                </div>
              )}
              
              {/* Message */}
              <MessageBubble
                key={msg._id}
                message={msg}
                isMe={isMe}
                showSender={showSender}
                currentUserId={currentUser._id}
                chatMembers={stableChatMembers}
                onReact={handleReact}
                onPollVote={handlePollVote}
                onReply={setReplyTo}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onReplyPrivately={handleReplyPrivately}
                onMentionClick={handleMentionClick}
                isGroupChat={chat?.isGroup}
                chatId={chat?._id}
              />
            </div>
          );
        })}

        {Object.values(typingUsers).length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
            }}
          >
            <div
              style={{
                background: "var(--message-other)",
                border: "1px solid var(--border)",
                borderRadius: "14px 14px 14px 4px",
                padding: "8px 14px",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              {Object.values(typingUsers).join(", ")}{" "}
              {Object.values(typingUsers).length === 1 ? "is" : "are"} typing…
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <MessageInput
        chatId={chat._id}
        currentUser={currentUser}
        isGroup={!!chat.isGroup}
        chatMembers={stableChatMembers}
        disabled={!!groupInteractionDisabledReason}
        disabledReason={groupInteractionDisabledReason}
        replyTo={replyTo}
        replyToId={replyTo?._id || null}
        onClearReply={() => setReplyTo(null)}
        onSendText={handleSendText}
        onFileSent={handleFileSent}
        onVoiceSent={handleVoiceSent}
        onPollCreated={handlePollCreated}
        socket={socket}
        isMobile={isMobile}
      />

      {mentionProfile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2500,
          }}
          onClick={closeMentionProfile}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              width: "min(420px, 92vw)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <Avatar
                name={mentionProfile.name || "?"}
                module={mentionProfile.module}
                size={44}
                online={!!mentionProfile.isOnline}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "var(--text-primary)" }}>
                  {mentionProfile.name || "Unknown User"}
                </div>
                <div style={{ fontSize: 12, color: mentionProfile.isOnline ? "#22C55E" : "var(--text-muted)", fontWeight: 600 }}>
                  {mentionProfile.isOnline ? "● Online" : `○ Last active ${formatLastActive(mentionProfile.lastSeen)}`}
                </div>
              </div>
            </div>

            {mentionProfileLoading && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                Loading latest profile details…
              </div>
            )}

            {mentionProfileError && (
              <div style={{ fontSize: 12, color: "#E53E3E", marginBottom: 10 }}>
                {mentionProfileError}
              </div>
            )}

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--input-bg)",
                padding: "10px 12px",
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "8px 10px",
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <div style={{ color: "var(--text-muted)" }}>Email</div>
              <div style={{ color: "var(--text-primary)", wordBreak: "break-word" }}>{mentionProfile.email || "—"}</div>

              <div style={{ color: "var(--text-muted)" }}>Role</div>
              <div style={{ color: "var(--text-primary)" }}>{humanizeRole(mentionProfile.role || mentionProfile.designation || "employee")}</div>

              <div style={{ color: "var(--text-muted)" }}>Department</div>
              <div style={{ color: "var(--text-primary)" }}>{mentionProfile.module || "—"}</div>

              <div style={{ color: "var(--text-muted)" }}>Manager</div>
              <div style={{ color: "var(--text-primary)" }}>
                {mentionProfile.managerId?.name || mentionProfile.manager?.name || "—"}
              </div>

              <div style={{ color: "var(--text-muted)" }}>Status</div>
              <div style={{ color: "var(--text-primary)" }}>
                {mentionProfile.isOnline ? "Online" : "Offline"}
              </div>
            </div>

            <button
              onClick={closeMentionProfile}
              style={{
                border: "none",
                background: "var(--navy)",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 14px",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Settings Menu Backdrop */}
      {showSettings && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={() => setShowSettings(false)}
        />
      )}

      {/* Alert Modal */}
      {showAlert && (
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
            zIndex: 2001,
          }}
          onClick={() => setShowAlert(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}>
              ℹ️ Notice
            </h3>
            <p style={{ margin: "0 0 20px 0", color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>
              {alertMessage}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAlert(false)}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.target.style.opacity = "1")}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (confirmAction === "delete" || confirmAction === "deleteGroup") && (
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
            zIndex: 2001,
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 400,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ margin: "0 0 12px 0", color: "var(--text-primary)" }}>
                {confirmAction === "delete"
                  ? "🗑️ Delete Chat"
                  : canDeleteGroup
                  ? "🗑️ Delete Group Chat"
                  : "🚪 Leave Group"}
              </h3>
              <p style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: 14 }}>
                {confirmAction === "delete"
                  ? "Are you sure you want to delete this chat?"
                  : canDeleteGroup
                  ? "Are you sure you want to delete this group permanently? All messages and members will be removed for everyone."
                  : "Are you sure you want to leave this group? You will stop receiving new messages here."}
              </p>
              <p
                style={{
                  margin: 0,
                  color: "#E53E3E",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ⚠️ This can't be undone
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: "10px 20px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "none",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.target.style.background = "none")}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction === "delete" ? executeDeleteChat : handleDeleteGroup}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: "#E53E3E",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.target.style.opacity = "1")}
              >
                {confirmAction === "delete"
                  ? "Delete"
                  : canDeleteGroup
                  ? "Delete Group"
                  : "Leave Group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Settings Backdrop */}
      {showGroupSettings && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
          onClick={() => setShowGroupSettings(false)}
        />
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
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
            zIndex: 2000,
          }}
          onClick={() => setShowAddMemberModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 450,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)" }}>
              ➕ Add Member
            </h2>
            <p style={{ margin: "0 0 16px 0", color: "var(--text-muted)", fontSize: 14 }}>
              Select one or more users to add to the group
            </p>

            <input
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              placeholder="Search employees by name, email, designation, module"
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />

            <div
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                maxHeight: 250,
                overflowY: "auto",
                marginBottom: 16,
              }}
            >
              {loadingAvailableUsers ? (
                <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 13 }}>
                  Loading users...
                </div>
              ) : filteredAvailableUsers.length === 0 ? (
                <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 13 }}>
                  No users available to add
                </div>
              ) : (
                filteredAvailableUsers.map((user) => (
                  <div
                    key={user._id}
                    onClick={() => toggleAddSelection(user._id)}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: selectedUsersToAdd.includes(user._id) ? "var(--hover-bg)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                    onMouseLeave={(e) => {
                      if (!selectedUsersToAdd.includes(user._id)) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `1.5px solid ${selectedUsersToAdd.includes(user._id) ? "var(--accent)" : "var(--border)"}`,
                        background: selectedUsersToAdd.includes(user._id) ? "var(--accent)" : "transparent",
                        color: "#fff",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {selectedUsersToAdd.includes(user._id) ? "✓" : ""}
                    </div>
                    <Avatar user={user} size={32} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                        {user.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {user.email}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {user.designation || "Employee"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAddMemberModal(false)}
                style={{
                  padding: "10px 20px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "none",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.target.style.background = "none")}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: selectedUsersToAdd.length ? "var(--accent)" : "var(--text-muted)",
                  color: "white",
                  cursor: selectedUsersToAdd.length ? "pointer" : "not-allowed",
                  fontSize: 14,
                  opacity: selectedUsersToAdd.length ? 1 : 0.6,
                }}
              >
                Add Member{selectedUsersToAdd.length > 1 ? "s" : ""}
                {selectedUsersToAdd.length ? ` (${selectedUsersToAdd.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Modal */}
      {showRemoveMemberModal && (
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
            zIndex: 2000,
          }}
          onClick={() => setShowRemoveMemberModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 450,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)" }}>
              ➖ Remove Member
            </h2>
            <p style={{ margin: "0 0 16px 0", color: "var(--text-muted)", fontSize: 14 }}>
              Select one or more members to remove from the group
            </p>

            <input
              value={removeMemberSearch}
              onChange={(e) => setRemoveMemberSearch(e.target.value)}
              placeholder="Search members by name, email, designation, module"
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontSize: 13,
              }}
            />

            <div
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                maxHeight: 250,
                overflowY: "auto",
                marginBottom: 16,
              }}
            >
              {removableMembers.length > 0 ? (
                removableMembers.map((member) => {
                  const creatorId = (liveChat || chat)?.createdBy?._id || (liveChat || chat)?.createdBy;
                  const isCreator = String(member?._id) === String(creatorId);
                  const isSelected = selectedUsersToRemove.includes(member._id);

                  return (
                  <button
                    key={member._id}
                    onClick={() => !isCreator && toggleRemoveSelection(member._id)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "none",
                      background: isSelected ? "var(--accent-light)" : "none",
                      textAlign: "left",
                      color: "var(--text-primary)",
                      cursor: isCreator ? "not-allowed" : "pointer",
                      fontSize: 14,
                      transition: "background 0.2s",
                      borderBottom: "1px solid var(--border)",
                      borderLeft: `3px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                      opacity: isCreator ? 0.7 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isCreator) e.target.style.background = "var(--hover-bg)";
                    }}
                    onMouseLeave={(e) =>
                      (e.target.style.background =
                        isSelected ? "var(--accent-light)" : "none")
                    }
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                          background: isSelected ? "var(--accent)" : "transparent",
                          color: "#fff",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isCreator ? "🔒" : isSelected ? "✓" : ""}
                      </div>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        {member.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{member.name || "Unknown"}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{member.email}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                          {member.designation || "Employee"}{isCreator ? " · Group creator" : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                )})
              ) : (
                <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 13 }}>
                  {((liveChat || chat)?.members || []).length > 0 ? "No matching members found" : "No members to remove"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowRemoveMemberModal(false)}
                style={{
                  padding: "10px 20px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "none",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.target.style.background = "none")}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: selectedUsersToRemove.length ? "#E53E3E" : "var(--text-muted)",
                  color: "white",
                  cursor: selectedUsersToRemove.length ? "pointer" : "not-allowed",
                  fontSize: 14,
                  opacity: selectedUsersToRemove.length ? 1 : 0.6,
                }}
              >
                Remove Member{selectedUsersToRemove.length > 1 ? "s" : ""}
                {selectedUsersToRemove.length ? ` (${selectedUsersToRemove.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Message Modal */}
      {showEditModal && (
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
            zIndex: 2000,
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px 0", color: "var(--text-primary)" }}>
              ✏️ Edit Message
            </h2>
            <textarea
              value={editText}
              onChange={(e) => {
                if (e.target.value.length <= 1000) {
                  setEditText(e.target.value);
                }
              }}
              placeholder="Edit your message..."
              autoFocus
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                fontSize: 14,
                resize: "vertical",
                minHeight: 100,
                boxSizing: "border-box",
                marginBottom: 8,
              }}
            />
            <div style={{ 
              fontSize: 11, 
              color: editText.length > 900 ? '#E53E3E' : 'var(--text-muted)', 
              marginBottom: 16,
              textAlign: 'right'
            }}>
              {editText.length}/1000 characters
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingMessage(null);
                  setEditText("");
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "none",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 14,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--hover-bg)")}
                onMouseLeave={(e) => (e.target.style.background = "none")}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editText.trim() || editText.length > 1000}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: editText.trim() && editText.length <= 1000 ? "var(--navy)" : "var(--border)",
                  color: "white",
                  cursor: editText.trim() && editText.length <= 1000 ? "pointer" : "not-allowed",
                  fontSize: 14,
                  opacity: editText.trim() && editText.length <= 1000 ? 1 : 0.6,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
