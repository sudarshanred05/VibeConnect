import { useState } from 'react';
import { createPoll } from '../../api';

export default function PollCreator({ chatId, senderId, replyToId = null, onCreated, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateOption = (i, val) => {
    const arr = [...options];
    arr[i] = val;
    setOptions(arr);
  };

  const handleCreate = async () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim()) return setError('Question is required');
    if (validOptions.length < 2) return setError('At least 2 options required');
    setLoading(true);
    setError('');
    try {
      const res = await createPoll({
        chatId, senderId, question: question.trim(),
        options: validOptions,
        expiresAt: expiresAt || null,
        replyTo: replyToId || null,
      });
      onCreated && onCreated(res.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 28,
        width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>📊 Create Poll</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
        </div>

        {error && <div style={{ background: 'rgba(220, 53, 69, 0.12)', color: '#842029', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13, border: '1px solid rgba(220, 53, 69, 0.28)' }}>{error}</div>}

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Question *</label>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to ask?"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Options *</label>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={opt} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`}
              style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            {options.length > 2 && (
              <button onClick={() => setOptions(options.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
            )}
          </div>
        ))}

        {options.length < 10 && (
          <button onClick={() => setOptions([...options, ''])}
            style={{ width: '100%', padding: '8px', border: '1px dashed var(--border)', borderRadius: 10, background: 'none', color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
            + Add Option
          </button>
        )}

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Expires (optional)</label>
        <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
          style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 20, boxSizing: 'border-box' }} />

        <button onClick={handleCreate} disabled={loading}
          style={{ width: '100%', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Creating...' : 'Create Poll'}
        </button>
      </div>
    </div>
  );
}
