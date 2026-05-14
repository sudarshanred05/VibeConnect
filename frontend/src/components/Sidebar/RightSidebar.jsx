import Avatar from '../common/Avatar';
import { getModuleColor } from '../common/Avatar';


// Format last seen time - show date and time consistently
const formatLastSeen = (lastSeen) => {
  if (!lastSeen) return 'Never seen';
  
  const now = new Date();
  const then = new Date(lastSeen);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  // Less than 1 day: show time and date
  if (diffDays < 1) {
    return then.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // 1 day or older: show date and time
  return then.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function RightSidebar({ chat, currentUser }) {
  if (!chat) return null;

  const isGroup = chat.isGroup;
  const otherUser = !isGroup ? chat.members?.find((m) => m._id !== currentUser._id) : null;

  // Collect shared files from messages (requires messages prop or can be derived)
  return (
    <div style={{ width: 260, background: 'var(--sidebar-bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
          {isGroup ? 'Group Info' : 'Contact Info'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Profile */}
        {!isGroup && otherUser && (
          <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            <Avatar name={otherUser.name} module={otherUser.module} size={64} online={otherUser.isOnline} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{otherUser.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{otherUser.designation}</div>
            <div style={{ fontSize: 12, color: getModuleColor(otherUser.module), fontWeight: 600, marginTop: 2 }}>{otherUser.module}</div>
            <div style={{ fontSize: 11, color: otherUser.isOnline ? '#22C55E' : 'var(--text-muted)', marginTop: 4 }}>
              {otherUser.isOnline ? '● Online' : '● Offline'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{otherUser.email}</div>
          </div>
        )}

        {/* Group Info */}
        {isGroup && (
          <>
            <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: getModuleColor(chat.module), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, margin: '0 auto 10px' }}>
                {chat.name?.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{chat.name}</div>
              {chat.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{chat.description}</div>}
            </div>

            {/* Members */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                Members ({chat.members?.length || 0})
              </div>
              {chat.members?.map((m) => (
                <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Avatar name={m.name} module={m.module} size={32} online={m.isOnline} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.designation}</div>
                    <div style={{ fontSize: 10, color: m.isOnline ? '#22C55E' : 'var(--text-muted)', marginTop: 2 }}>
                      {m.isOnline ? '● Online' : `● Last seen ${formatLastSeen(m.lastSeen)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
