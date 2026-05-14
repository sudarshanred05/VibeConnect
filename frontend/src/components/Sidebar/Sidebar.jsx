import { useState, useEffect, useCallback } from 'react';
import Avatar from '../common/Avatar';
import ChatLoader from '../common/ChatLoader';
import { getChats, getUsers, createChat, markChatAsSeen } from '../../api';
import { getModuleColor } from '../common/Avatar';
import { unsubscribeFromPushNotifications } from '../../utils/pushNotifications';

const getLastMsgPreview = (chat) => {
  if (!chat.lastMessage) return 'No messages yet';
  const msg = chat.lastMessage;
  if (msg.isDeleted) return '🚫 Message deleted';
  if (msg.messageType === 'image') return '🖼 Photo';
  if (msg.messageType === 'file') return `📄 ${msg.fileName || 'File'}`;
  if (msg.messageType === 'voice') return '🎙 Voice message';
  if (msg.messageType === 'poll') return '📊 Poll';
  if (msg.messageType === 'system') return msg.content;
  
  // Handle encrypted content that wasn't decrypted (shouldn't happen, but safety check)
  if (typeof msg.content === 'object' && msg.content !== null) {
    return '[Encrypted message]';
  }
  
  return msg.content || '';
};

// ─── New Direct Message Modal ────────────────────────────────────
function NewDMModal({ currentUser, existingChats, onClose, onChatOpened }) {
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(null); // userId being created

  // Load ALL employees once on mount and when existingChats changes
  useEffect(() => {
    setLoadingUsers(true);
    getUsers()
      .then((r) => {
        const userData = r.data?.data || r.data || [];
        const users = Array.isArray(userData) ? userData : [];
        
        // Get user IDs who already have DM chats with current user
        const existingDMUserIds = new Set(
          existingChats
            .filter(chat => !chat.isGroup)
            .flatMap(chat => chat.members)
            .map(member => member._id || member)
            .filter(id => id !== currentUser._id)
        );
        
        // Filter out current user, admins, and users with existing DM chats
        const filteredUsers = users.filter((u) => 
          u._id !== currentUser._id && 
          u.role !== 'admin' && 
          !existingDMUserIds.has(u._id)
        );
        
        setAllUsers(filteredUsers);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoadingUsers(false));
  }, [currentUser._id, existingChats.length]); // Add existingChats.length as dependency

  // Client-side filter — no extra API calls
  const filtered = allUsers.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.designation || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      u.module.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const startDM = async (user) => {
    if (creating) return;
    setCreating(user._id);
    try {
      const res = await createChat({
        isGroup: false,
        members: [currentUser._id, user._id],
        createdBy: currentUser._id,
      });
      const chatData = res.data?.data || res.data;
      onChatOpened(chatData);   // adds to sidebar + selects
      onClose();
    } catch (e) {
      alert('Could not open chat: ' + e.message);
      setCreating(null);
    }
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: '24px 24px 20px',
        width: 440, maxHeight: '78vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>New Direct Message</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Start a private 1-to-1 conversation</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--input-bg)', border: '1.5px solid var(--border)',
          borderRadius: 10, padding: '9px 14px', marginBottom: 14,
        }}>
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>🔍</span>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, designation, or module…"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              outline: 'none', fontSize: 13, color: 'var(--text-primary)',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
              ✕
            </button>
          )}
        </div>

        {/* Count */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {loadingUsers ? 'Loading employees…'
            : filtered.length === 0 ? 'No employees found'
              : `${filtered.length} employee${filtered.length !== 1 ? 's' : ''}${search ? ' match your search' : ''}`}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loadingUsers && (
            <ChatLoader compact message="Loading employees..." />
          )}

          {!loadingUsers && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
              No employees match "{search}"
            </div>
          )}

          {filtered.map((u) => {
            const isCreating = creating === u._id;
            return (
              <div
                key={u._id}
                onClick={() => !creating && startDM(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  border: '1.5px solid var(--border)',
                  background: 'var(--input-bg)',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  opacity: creating && !isCreating ? 0.5 : 1,
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!creating) {
                    e.currentTarget.style.borderColor = 'var(--navy)';
                    e.currentTarget.style.background = 'var(--hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--input-bg)';
                }}
              >
                <Avatar name={u.name} module={u.module} size={42} online={u.isOnline} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.designation || 'Employee'}</div>
                  <div style={{ fontSize: 10, color: getModuleColor(u.module), fontWeight: 600, marginTop: 1 }}>{u.module}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: u.isOnline ? '#22C55E' : 'var(--text-muted)',
                  }}>
                    {u.isOnline ? '● Online' : '○ Offline'}
                  </div>
                  {isCreating ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Opening…</div>
                  ) : (
                    <div style={{
                      fontSize: 11, color: 'var(--navy)', fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6,
                      background: 'var(--accent-light)', border: '1px solid var(--accent-border)',
                    }}>
                      Message →
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────
export default function Sidebar({
  currentUser, activeChat, onSelectChat,
  onCreateGroup, darkMode, onToggleTheme, socket,
  isVisible, isMobile,
  openDM, onDMClosed,
}) {
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'chats' | 'groups'
  const [loading, setLoading] = useState(true);
  const [showDM, setShowDM] = useState(false);
  const [unread, setUnread] = useState({});

  // Sync external DM trigger
  useEffect(() => {
    if (openDM) setShowDM(true);
  }, [openDM]);


  // ── Load chat list ──────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    if (!currentUser?._id) return;
    try {
      const res = await getChats(currentUser._id);
      const chatData = res.data?.data || res.data || [];
      const chatsArray = Array.isArray(chatData) ? chatData : [];
      const normalizedChats = chatsArray.map((chat) => {
        if (!chat?.isGroup) return chat;
        const isActiveMember = (chat.members || []).some((m) => (m?._id || m) === currentUser._id);
        return {
          ...chat,
          isRemovedFromGroup: !isActiveMember,
        };
      });
      
      // Initialize unread count from API response
      const unreadFromAPI = {};
      normalizedChats.forEach((chat) => {
        if (chat.unreadCount > 0) {
          unreadFromAPI[chat._id] = chat.unreadCount;
        }
      });
      setUnread(unreadFromAPI);
      
      setChats(normalizedChats);
    } catch (err) {
      console.error('loadChats ERROR:', err.message);
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?._id]);

  useEffect(() => { loadChats(); }, [loadChats]);

  // ── Real-time: update last message preview in sidebar ───────────
  useEffect(() => {
    if (!socket) return;

    const onReceive = async (msg) => {
      const msgChatId = msg.chatId?._id || msg.chatId;

      setChats((prev) => {
        const idx = prev.findIndex((c) => c._id === msgChatId);

        if (idx === -1) {
          // If chat not in list, fetch it and add it
          import('../../api').then(({ getChatById }) => {
            getChatById(msgChatId).then(res => {
              setChats(old => {
                if (old.find(c => c._id === msgChatId)) return old;
                // Ensure msg.content is a string, not an object
                const safeMsg = {
                  ...msg,
                  content: typeof msg.content === 'object' ? '[New message]' : msg.content
                };
                const chatData = res.data?.data || res.data || {};
                return [{ ...chatData, lastMessage: safeMsg, updatedAt: msg.createdAt || new Date() }, ...old];
              });
              // Join the room for this new chat
              socket.emit('join_chat', { chatId: msgChatId, userId: currentUser._id });
            }).catch(e => {
              console.error('Failed to fetch new chat:', e);
              loadChats(); // Fallback to full reload
            });
          });
          return prev;
        }

        const updatedChat = {
          ...prev[idx],
          lastMessage: {
            ...msg,
            content: typeof msg.content === 'object' ? '[New message]' : msg.content
          },
          updatedAt: msg.createdAt || new Date()
        };

        const remaining = prev.filter((c, i) => i !== idx);
        return [updatedChat, ...remaining]; // Move to top
      });

      // Update unread count if not active chat
      if (activeChat?._id !== msgChatId) {
        setUnread((prev) => ({
          ...prev,
          [msgChatId]: (prev[msgChatId] || 0) + 1,
        }));
      }
    };

    const onStatus = ({ userId, isOnline, lastSeen }) => {
      setChats((prev) => prev.map((c) => ({
        ...c,
        members: (c.members || []).map((m) =>
          m._id === userId ? { ...m, isOnline, lastSeen: lastSeen || m.lastSeen } : m
        ),
      })));
    };

    const onAdded = (newChat) => {
      setChats((prev) => {
        const existing = prev.find(c => c._id === newChat._id);
        if (existing) {
          // Update existing chat with new members data (from background load)
          return prev.map(c => c._id === newChat._id ? newChat : c);
        }
        // Add new chat
        return [newChat, ...prev];
      });
      // Update active chat if it's the one being added
      if (activeChat?._id === newChat._id) {
        onSelectChat?.(newChat);
      }
      // Join the room dynamically
      socket.emit('join_chat', { chatId: newChat._id, userId: currentUser._id });
    };

    // Listen for 'message_seen' to update UI locally if needed
    const onSeen = ({ messageId, userId, chatId, seenAt }) => {
      if (userId === currentUser._id) {
        // I saw it, clear unread
        setUnread(prev => {
          const copy = { ...prev };
          delete copy[chatId];
          return copy;
        });
        
        // Update the chat's lastMessage.seenBy to reflect the seen status
        setChats((prev) => prev.map((c) => {
          if (c._id === chatId && c.lastMessage?._id === messageId) {
            const seenBy = c.lastMessage.seenBy || [];
            const alreadySeen = seenBy.some(s => (s.userId?._id || s.userId) === userId);
            if (!alreadySeen) {
              return {
                ...c,
                lastMessage: {
                  ...c.lastMessage,
                  seenBy: [...seenBy, { userId, seenAt: seenAt || new Date() }]
                }
              };
            }
          }
          return c;
        }));
      }
    };

    const onChatDeleted = ({ chatId }) => {
      // Remove deleted chat from sidebar
      setChats((prev) => prev.filter((c) => c._id !== chatId));
      setUnread((prev) => {
        const copy = { ...prev };
        delete copy[chatId];
        return copy;
      });
      // If deleted chat is active, close the chat window and go back to chat list
      const activeChatId = activeChat?._id?.toString?.() || activeChat?._id;
      const deletedChatId = chatId?.toString?.() || chatId;
      if (activeChatId === deletedChatId) {
        onSelectChat(null);
      }
    };

    const onChatUpdated = ({ chatId, members }) => {
      // Update chat members and member count in sidebar
      setChats((prev) => prev.map((c) => {
        if (c._id === chatId) {
          const isActiveMember = (members || []).some((m) => (m?._id || m) === currentUser._id);
          return { ...c, members: members, isRemovedFromGroup: c.isGroup ? !isActiveMember : false };
        }
        return c;
      }));
    };

    const onRemovedFromChat = ({ chatId }) => {
      setChats((prev) => prev.map((c) => {
        if (c._id !== chatId || !c.isGroup) return c;
        return {
          ...c,
          isRemovedFromGroup: true,
          members: (c.members || []).filter((m) => (m?._id || m) !== currentUser._id),
        };
      }));
    };

    // Handle message edits - update lastMessage if it was edited
    const onMessageEdited = ({ messageId, content, isEdited }) => {
      setChats((prev) => prev.map((c) => {
        if (c.lastMessage?._id === messageId) {
          return {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              content: content,
              isEdited: isEdited
            }
          };
        }
        return c;
      }));
    };

    // Handle message deletions - update lastMessage if it was deleted
    const onMessageDeleted = ({ messageId }) => {
      setChats((prev) => prev.map((c) => {
        if (c.lastMessage?._id === messageId) {
          return {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              isDeleted: true,
              content: 'This message was deleted'
            }
          };
        }
        return c;
      }));
    };

    socket.on('receive_message', onReceive);
    socket.on('user_status', onStatus);
    socket.on('added_to_chat', onAdded);
    socket.on('message_seen', onSeen);
    socket.on('message_edited', onMessageEdited);
    socket.on('message_deleted', onMessageDeleted);
    socket.on('chat_deleted', onChatDeleted);
    socket.on('chat_updated', onChatUpdated);
    socket.on('removed_from_chat', onRemovedFromChat);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('user_status', onStatus);
      socket.off('added_to_chat', onAdded);
      socket.off('message_seen', onSeen);
      socket.off('message_edited', onMessageEdited);
      socket.off('message_deleted', onMessageDeleted);
      socket.off('chat_deleted', onChatDeleted);
      socket.off('chat_updated', onChatUpdated);
      socket.off('removed_from_chat', onRemovedFromChat);
    };
  }, [socket, loadChats, currentUser._id, activeChat]);

  // ── Helpers ─────────────────────────────────────────────────────
  const getChatName = (chat) =>
    chat.isGroup
      ? chat.name
      : chat.members?.find((m) => m._id !== currentUser._id)?.name || 'Unknown';

  const getChatUser = (chat) =>
    !chat.isGroup ? chat.members?.find((m) => m._id !== currentUser._id) : null;

  // When a DM or group is created, add to list and open it
  const handleChatOpened = (chat) => {
    setChats((prev) => [chat, ...prev.filter((c) => c._id !== chat._id)]);
    handleSelectChat(chat);
  };

  const handleSelectChat = (chat) => {
    if (!chat) {
      onSelectChat(chat);
      return;
    }
    
    // Clear unread count immediately when opening
    setUnread((prev) => {
      const newUnread = { ...prev };
      delete newUnread[chat._id];
      return newUnread;
    });
    
    // Also optimistically update the lastMessage seenBy for instant UI feedback
    setChats((prev) => prev.map((c) => {
      if (c._id === chat._id && c.lastMessage) {
        const seenBy = c.lastMessage.seenBy || [];
        const alreadySeen = seenBy.some(s => (s.userId?._id || s.userId) === currentUser._id);
        if (!alreadySeen) {
          return {
            ...c,
            lastMessage: {
              ...c.lastMessage,
              seenBy: [...seenBy, { userId: currentUser._id, seenAt: new Date() }]
            }
          };
        }
      }
      return c;
    }));
    
    markChatAsSeen(chat._id, currentUser._id).catch((err) => {
      console.warn("Failed to persist chat seen status:", err?.message || err);
    });

    onSelectChat(chat);
  };

  const filtered = chats.filter((c) => {
    if (filter === 'chats' && c.isGroup) return false;
    if (filter === 'groups' && !c.isGroup) return false;
    return getChatName(c).toLowerCase().includes(search.toLowerCase());
  });

  if (isMobile && !isVisible) return null;

  return (
    <>
      <div style={{
        width: isMobile ? '100%' : 280,
        height: '100%',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: isMobile ? 'fixed' : 'relative',
        left: 0,
        top: 0,
        zIndex: 50
      }}>

        {/* ── Logo ────────────────────────────────────────────── */}
        <div style={{ padding: '14px 16px 13px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36,
                background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                borderRadius: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                flexShrink: 0,
              }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: '-0.5px' }}>VC</span>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>VibeConnect</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.6px', textTransform: 'uppercase', lineHeight: 1.3 }}>Messaging</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {currentUser?.role === 'admin' && (
                <button 
                  onClick={() => window.location.href = '/admin'}
                  style={{
                    background: 'var(--hover-bg)', border: '1px solid var(--border)',
                    borderRadius: 8, width: 30, height: 30, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer',
                  }}
                  title="Admin Dashboard"
                >
                  ⚙️
                </button>
              )}
              <button onClick={onToggleTheme}
                style={{
                  background: 'var(--hover-bg)', border: '1px solid var(--border)',
                  borderRadius: 8, width: 30, height: 30, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, cursor: 'pointer',
                }}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Unread badge strip ───────────────────────────────── */}
        {(() => {
          const unreadChatsCount = chats.filter(chat => unread[chat._id] > 0).length;
          const badgeText = unreadChatsCount > 9 ? '9+' : unreadChatsCount.toString();
          if (!unreadChatsCount) return null;
          return (
            <div style={{ padding: '4px 14px 0', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{
                background: '#E53E3E', color: '#fff', fontSize: 10, fontWeight: 700,
                minWidth: 18, height: 18, borderRadius: 9, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              }}>
                {badgeText} unread
              </span>
            </div>
          );
        })()}

        <>
            {/* ── Search + Action Buttons ──────────────────────── */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              {/* Search bar */}
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--bg)', border: '1.5px solid var(--border)',
                borderRadius: 10, padding: '7px 12px', gap: 8, marginBottom: 8,
                transition: 'border-color 0.18s',
              }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations…"
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text-primary)' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Direct Message */}
                <button
                  onClick={() => setShowDM(true)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: 'var(--hover-bg)', color: 'var(--navy)',
                    border: '1px solid var(--border)',
                  }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--accent-light)',
                      border: '1px solid var(--accent-border)',
                      color: 'var(--navy)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span>Direct Message</span>
                </button>

                {/* New Group */}
                <button
                  onClick={() => onCreateGroup(handleChatOpened)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: 'var(--navy)', color: '#fff', border: 'none',
                  }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(255, 255, 255, 0.22)',
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <span>New Group</span>
                </button>
              </div>
            </div>

            {/* ── Filter tabs ──────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'all',    label: 'All' },
                { key: 'chats',  label: 'Chats' },
                { key: 'groups', label: 'Groups' },
              ].map(({ key, label }) => {
                const active = filter === key;
                const tabUnread = key === 'all'
                  ? Object.values(unread).reduce((s, v) => s + (v > 0 ? 1 : 0), 0)
                  : chats.filter(c =>
                      (key === 'chats' ? !c.isGroup : c.isGroup) && unread[c._id] > 0
                    ).length;
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      flex: 1, padding: '5px 0', borderRadius: 8,
                      border: active ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                      background: active ? 'var(--accent-light)' : 'var(--bg)',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 5, transition: 'all 0.15s',
                    }}
                  >
                    {label}
                    {tabUnread > 0 && (
                      <span style={{
                        background: active ? 'var(--accent)' : '#E53E3E',
                        color: '#fff', fontSize: 9, fontWeight: 700,
                        minWidth: 15, height: 15, borderRadius: 8,
                        display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', padding: '0 4px',
                      }}>
                        {tabUnread > 9 ? '9+' : tabUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Chat List ────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && (
                <ChatLoader compact message="Loading conversations..." />
              )}

              {!loading && filtered.length === 0 && (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  {search
                    ? `No conversations matching "${search}"`
                    : filter === 'groups'
                      ? <>No groups yet.<br />Click <strong>New Group</strong> to create one.</>
                      : filter === 'chats'
                        ? <>No direct messages yet.<br />Click <strong>Direct Message</strong> to start one.</>
                        : <>No conversations yet.<br />Click <strong>Direct Message</strong> or <strong>New Group</strong> to get started.</>
                  }
                </div>
              )}

              {filtered.map((chat) => {
                // Use string comparison for IDs to handle both string and ObjectId cases
                const activeChatId = activeChat?._id?.toString?.() || activeChat?._id;
                const currentChatId = chat._id?.toString?.() || chat._id;
                const isActive = activeChatId === currentChatId && activeChatId !== undefined;
                
                const name = getChatName(chat);
                const user = getChatUser(chat);
                const preview = getLastMsgPreview(chat);
                const time = chat.updatedAt
                  ? new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                // Unread Logic: Use backend unreadCount (more reliable than frontend calculation)
                // The backend checks: lastMessageAt > ChatMember.lastReadAt && isFromOtherUser
                // This is more accurate than checking seenBy array
                const showUnread = (unread[chat._id] > 0);
                const displayCount = unread[chat._id] || 0;

                const handleClick = () => {
                  handleSelectChat(chat);
                };

                return (
                  <div
                    key={chat._id}
                    onClick={handleClick}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', cursor: 'pointer',
                      background: isActive
                        ? 'linear-gradient(90deg, var(--hover-bg) 0%, var(--hover-bg) 100%)'
                        : 'transparent',
                      borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                      transition: 'background 0.14s, border-color 0.14s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {chat.isGroup ? (
                      <div style={{
                        width: 42, height: 42, borderRadius: 13,
                        background: getModuleColor(chat.module),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      }}>
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    ) : (
                      <Avatar name={name} module={user?.module} size={42} online={user?.isOnline} />
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                        <span style={{
                          fontWeight: showUnread ? 700 : 600, fontSize: 13.5,
                          color: isActive ? 'var(--navy)' : (showUnread ? 'var(--text-primary)' : 'var(--text-primary)'),
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, marginRight: 6,
                        }}>
                          {name}
                        </span>
                        <span style={{
                          fontSize: 10.5, flexShrink: 0,
                          color: showUnread ? 'var(--accent)' : 'var(--text-muted)',
                          fontWeight: showUnread ? 700 : 400,
                        }}>{time}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div style={{
                          fontSize: 12, flex: 1,
                          color: showUnread ? 'var(--text-secondary)' : 'var(--text-muted)',
                          fontWeight: showUnread ? 500 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {preview}
                        </div>
                        {showUnread && (
                          <div style={{
                            background: 'var(--accent)', color: '#fff',
                            fontSize: 10, fontWeight: 700,
                            minWidth: 18, height: 18, borderRadius: 9,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 5px', flexShrink: 0,
                          }}>
                            {displayCount > 99 ? '99+' : displayCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        </>

        {/* ── Current User ─────────────────────────────────────── */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Avatar
              name={currentUser?.name || 'You'}
              module={currentUser?.module}
              size={38}
              online={true}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentUser?.name || 'You'}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 2,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(34, 197, 94, 0.12)',
                    color: '#15803d',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#22c55e',
                      display: 'inline-block',
                    }}
                  />
                  Active
                </span>
                {currentUser?.module && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 110,
                    }}
                    title={currentUser.module}
                  >
                    {currentUser.module}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={async () => {
                await unsubscribeFromPushNotifications();
                localStorage.removeItem('accessToken');
                localStorage.removeItem('user');
                window.location.href = '/login';
              }}
              title="Logout"
              aria-label="Logout"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 10,
                background: 'var(--hover-bg)',
                color: 'var(--navy)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── DM Modal ───────────────────────────────────────────── */}
      {showDM && (
        <NewDMModal
          currentUser={currentUser}
          existingChats={chats}
          onClose={() => { setShowDM(false); onDMClosed?.(); }}
          onChatOpened={handleChatOpened}
        />
      )}
    </>
  );
}