import { memo, useCallback, useMemo, useState } from 'react';

const getUserVoteIndex = (poll, userId) => {
  const vote = poll?.voters?.find((v) => v.userId === userId || v.userId?._id === userId);
  return vote?.optionIndex ?? null;
};

function PollMessage({ poll, messageId, userId, onVote }) {
  const [openOptionIndex, setOpenOptionIndex] = useState(null);

  if (!poll || !Array.isArray(poll.options)) return null;

  const voted = useMemo(() => getUserVoteIndex(poll, userId), [poll, userId]);
  const total = useMemo(
    () => poll.options.reduce((a, o) => a + o.votes, 0) || 1,
    [poll.options],
  );

  const votersByOption = useMemo(() => {
    const buckets = new Map();
    (poll.voters || []).forEach((v) => {
      const list = buckets.get(v.optionIndex);
      if (list) list.push(v);
      else buckets.set(v.optionIndex, [v]);
    });
    return buckets;
  }, [poll.voters]);

  const handleVote = useCallback((idx) => {
    const isRemovingVote = voted === idx;
    const nextVote = isRemovingVote ? null : idx;
    onVote?.(messageId, nextVote);
  }, [voted, onVote, messageId]);

  const expiry = useMemo(() => (poll.expiresAt ? new Date(poll.expiresAt) : null), [poll.expiresAt]);
  const expired = expiry && new Date() > expiry;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      minWidth: 260,
      maxWidth: 320,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
        📊 {poll.question}
      </div>

      {poll.options.map((opt, i) => {
        const pct = Math.round((opt.votes / total) * 100);
        const isMyVote = voted === i;
        const votersForOption = votersByOption.get(i) || [];
        const isOpen = openOptionIndex === i;

        return (
          <div
            key={i}
            style={{
              marginBottom: 8,
              cursor: 'default',
              borderRadius: 8,
              padding: '6px 8px',
              background: isMyVote ? 'var(--accent-light)' : 'transparent',
              border: `1px solid ${isMyVote ? 'var(--accent-border)' : 'transparent'}`,
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => !expired && handleVote(i)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  padding: 0,
                  margin: 0,
                  cursor: expired ? 'default' : 'pointer',
                  fontWeight: isMyVote ? 700 : 400,
                }}
              >
                {isMyVote ? '✓ ' : ''}{opt.text}
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {opt.votes} · {pct}%
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: isMyVote ? 'var(--navy)' : 'var(--text-muted)',
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>

            {votersForOption.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setOpenOptionIndex(isOpen ? null : i)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {isOpen ? 'Hide voters' : `View voters (${votersForOption.length})`}
                </button>

                {isOpen && (
                  <div
                    style={{
                      marginTop: 6,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--input-bg)',
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {votersForOption.map((v, idx) => (
                      <div key={`${i}-${idx}`} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        • {v.userId?.name || 'User'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        {total} vote{total !== 1 ? 's' : ''} · {expired ? '⏱ Ended' : voted !== null ? 'Voted (tap again to remove or another to change)' : 'Tap to vote'}
        {expiry && !expired && (
          <span> · Ends {expiry.toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.poll === nextProps.poll &&
    prevProps.messageId === nextProps.messageId &&
    prevProps.userId === nextProps.userId &&
    prevProps.onVote === nextProps.onVote
  );
};

export default memo(PollMessage, areEqual);
