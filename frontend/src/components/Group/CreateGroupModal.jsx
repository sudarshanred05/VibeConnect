import { useState, useEffect } from 'react';
import { getUsers, getModules, createChat } from '../../api';
import Avatar from '../common/Avatar';

export default function CreateGroupModal({ currentUserId, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [module, setModule] = useState('');
  const [modules, setModules] = useState([]);
  const [search, setSearch] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load ALL approved employees and modules on mount
  useEffect(() => {
    Promise.all([
      getUsers(),
      getModules()
    ]).then(([usersRes, modulesRes]) => {
      const users = usersRes?.data?.data || [];
      const modulesList = modulesRes?.data?.data || [];
      // Filter out current user and admins from group creation
      setAllUsers(users.filter((u) => u._id !== currentUserId && u.role !== 'admin'));
      setModules(modulesList);
    }).catch((err) => {
      console.error('Error loading users:', err);
      setError('Failed to load users: ' + (err.response?.data?.error || err.message));
    });
  }, [currentUserId]);

  // Clear search only when module changes, preserve selection
  useEffect(() => {
    setSearch('');
  }, [module]);

  // Live search and module filter
  const filtered = allUsers.filter((u) => {
    // 1. Filter by Module if selected
    if (module && u.module !== module) return false;

    // 2. Filter by search query
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      (u.module || '').toLowerCase().includes(q) ||
      (u.designation || '').toLowerCase().includes(q)
    );
  });

  const toggleUser = (id) => {
    // Prevent selecting more than 250 members
    if (!selected.includes(id) && selected.length >= 250) {
      setError('Maximum group size is 250 members');
      return;
    }
    setError(''); // Clear error when deselecting
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selected.includes(u._id));

  const selectAll = () => {
    if (allFilteredSelected) {
      // Deselect only the currently-visible users, keep the rest
      const filteredIds = new Set(filtered.map((u) => u._id));
      setSelected((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      // Merge currently-visible users into existing selection (additive)
      setSelected((prev) => {
        const existing = new Set(prev);
        filtered.forEach((u) => existing.add(u._id));
        return Array.from(existing);
      });
    }
  };

  const clearAll = () => setSelected([]);

  const handleCreate = async () => {
    if (!name.trim()) return setError('Group name is required');
    if (selected.length === 0) return setError('Select at least 1 member');
    if (selected.length > 250) return setError('Maximum group size is 250 members');
    setLoading(true);
    setError('');
    try {
      const res = await createChat({
        isGroup: true,
        name: name.trim(),
        description,
        module: module || null,
        members: selected,
        createdBy: currentUserId,
      });
      // Pass the correct data structure (res.data.data not res.data)
      const chatData = res.data?.data || res.data;
      onCreated && onCreated(chatData);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedUsers = allUsers.filter((u) => selected.includes(u._id));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: 28,
        width: 540, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>Create Group</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Group Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Group Name *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 Planning · Cross-functional Team"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Description</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Module Filter (optional) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Module Filter <span style={{ fontWeight: 400 }}>(optional — filter members by module)</span>
            </label>
            <select
              value={module} onChange={(e) => setModule(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
            >
              <option value="">All employees</option>
              {modules.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
            </select>
          </div>

          {/* Selected chips */}
          {selected.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                Selected ({selected.length})
                <button onClick={clearAll} style={{ marginLeft: 10, fontSize: 11, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Clear all</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedUsers.map((u) => (
                  <div key={u._id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px 4px 6px', borderRadius: 20,
                      background: 'var(--accent-light)', border: '1px solid var(--accent-border)',
                      fontSize: 12, color: 'var(--navy)',
                    }}>
                    <Avatar name={u.name} module={u.module} size={18} />
                    <span style={{ fontWeight: 600 }}>{u.name.split(' ')[0]}</span>
                    <button onClick={() => toggleUser(u._id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Member picker */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                All Employees ({allUsers.length})
              </label>
              {filtered.length > 0 && (
                <button onClick={selectAll}
                  style={{ fontSize: 11, color: allFilteredSelected ? '#EF4444' : 'var(--navy)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {allFilteredSelected ? 'Deselect filtered' : `Select all${module ? ` (${module})` : search ? ' filtered' : ''}`}
                </button>
              )}
            </div>

            {/* Search within member list */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔍</span>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name, module, or designation..."
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--text-primary)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              )}
            </div>

            {/* User rows */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>No employees match your search</div>
              )}
              {filtered.map((u) => {
                const isSelected = selected.includes(u._id);
                return (
                  <div key={u._id} onClick={() => toggleUser(u._id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
                      borderRadius: 10, cursor: 'pointer',
                      background: isSelected ? 'var(--accent-light)' : 'var(--input-bg)',
                      border: `1.5px solid ${isSelected ? 'var(--accent-border)' : 'var(--border)'}`,
                      transition: 'all 0.12s',
                    }}>
                    <Avatar name={u.name} module={u.module} size={36} online={u.isOnline} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.designation}</div>
                    </div>
                    {/* Badges */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {/* Role badge */}
                      {u.role && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                          background: u.role === 'admin' ? '#EF444422' : u.role === 'manager' ? '#3B82F622' : u.role === 'hr' ? '#F59E0B22' : '#10B98122',
                          color: u.role === 'admin' ? '#EF4444' : u.role === 'manager' ? '#3B82F6' : u.role === 'hr' ? '#F59E0B' : '#10B981',
                          border: `1px solid ${u.role === 'admin' ? '#EF444444' : u.role === 'manager' ? '#3B82F644' : u.role === 'hr' ? '#F59E0B44' : '#10B98144'}`,
                          whiteSpace: 'nowrap',
                          textTransform: 'uppercase',
                        }}>{u.role}</span>
                      )}
                      {/* Module badge */}
                      {u.module && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                          background: 'var(--accent-light)',
                          color: 'var(--navy)',
                          border: '1px solid var(--accent-border)',
                          whiteSpace: 'nowrap',
                        }}>{u.module}</span>
                      )}
                    </div>
                    {/* Checkbox */}
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: isSelected ? 'var(--navy)' : 'transparent',
                      border: `2px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <button
          onClick={handleCreate}
          disabled={loading || selected.length === 0 || !name.trim()}
          style={{
            marginTop: 18, width: '100%', background: 'var(--navy)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '13px', fontWeight: 700, fontSize: 14,
            cursor: loading || selected.length === 0 || !name.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || selected.length === 0 || !name.trim() ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}>
          {loading ? 'Creating…' : `Create Group${selected.length > 0 ? ` with ${selected.length} member${selected.length > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>
    </div>
  );
}