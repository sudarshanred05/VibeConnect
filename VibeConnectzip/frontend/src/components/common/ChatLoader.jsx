export default function ChatLoader({
  message = "Loading...",
  detail = "Preparing conversations, users, and knowledge insights.",
  compact = false,
}) {
  if (compact) {
    return (
      <div className="app-loader-compact" aria-live="polite" aria-busy="true">
        <span className="admin-mini-chat" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="admin-loader-scene" aria-live="polite" aria-busy="true">
      <div className="admin-loader-chat" aria-hidden="true">
        <div className="admin-loader-bubble admin-loader-bubble-in">
          <span />
          <span />
          <span />
        </div>
        <div className="admin-loader-bubble admin-loader-bubble-out">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="admin-loader-card">
        <h2>{message}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
