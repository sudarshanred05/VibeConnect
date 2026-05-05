import { useVoice } from '../../hooks/useVoice';

const MicIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

export default function VoiceRecorder({ chatId, senderId, replyToId = null, onSent, disabled = false }) {
  const { recording, duration, uploading, startRecording, stopRecording, cancelRecording, formatDuration } = useVoice({ chatId, senderId, replyToId, onSent });

  if (uploading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--hover-bg)', borderRadius: 999, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Uploading…</span>
      </div>
    );
  }

  if (recording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: 'rgba(220, 53, 69, 0.10)', borderRadius: 999, border: '1px solid rgba(220, 53, 69, 0.3)' }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--danger)',
            display: 'inline-block',
            animation: 'pulse 1s infinite',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', minWidth: 40 }}>{formatDuration(duration)}</span>
        <button
          onClick={stopRecording}
          title="Send voice message"
          aria-label="Send voice message"
          style={{
            background: 'var(--danger)',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
        <button
          onClick={cancelRecording}
          title="Cancel"
          aria-label="Cancel"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  if (disabled) {
    return (
      <button
        disabled
        title="Voice messaging disabled"
        aria-label="Voice messaging disabled"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          padding: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.5,
          cursor: 'not-allowed',
        }}
      >
        <MicIcon />
      </button>
    );
  }

  return (
    <button
      onClick={startRecording}
      title="Record voice message"
      aria-label="Record voice message"
      style={{
        background: 'var(--hover-bg)',
        border: '1px solid var(--border)',
        color: 'var(--navy)',
        width: 32,
        height: 32,
        borderRadius: 10,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <MicIcon size={16} />
    </button>
  );
}
