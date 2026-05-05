import { useState, useEffect, useCallback, useRef } from 'react';
import { getMessages } from '../api';

const toIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const raw = value._id ?? value.id;
    return raw ? String(raw) : '';
  }
  return String(value);
};

export const useMessages = (chatId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState(null);
  const chatIdRef = useRef(chatId);
  const abortControllerRef = useRef(null);
  const fetchingRef = useRef(false);
  
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);

  const fetchMessages = useCallback(async ({ nextCursor = null, cid, append = false } = {}) => {
    const id = cid || chatIdRef.current;
    if (!id || id === 'ai') return;
    
    // Prevent duplicate fetches
    if (fetchingRef.current) {
      console.log('⏭️ Skipping duplicate fetch for', id);
      return;
    }
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    fetchingRef.current = true;
    
    setLoading(true);
    try {
      const res = await getMessages(id, nextCursor, 20);
      // Verify response is still for current chatId
      if (chatIdRef.current !== id) {
        console.log('⏭️ Skipping response for outdated chatId');
        return;
      }
      
      const msgData = res.data?.data || res.data || [];
      const messages = Array.isArray(msgData) ? msgData : [];
      
      if (!append) {
        setMessages(messages);
      } else {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m._id));
          return [...messages.filter((m) => !ids.has(m._id)), ...prev];
        });
      }
      const pagination = res.data?.pagination || res.pagination || {};
      setHasMore(!!pagination.hasMore);
      setCursor(pagination.nextCursor || null);
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError') {
        console.log('⏭️ Request cancelled');
        return;
      }
      console.error('fetchMessages:', err.message);
      setMessages([]);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chatId || chatId === 'ai') { 
      setMessages([]); 
      return; 
    }
    setMessages([]);
    setCursor(null);
    setHasMore(true);
    fetchMessages({ nextCursor: null, cid: chatId, append: false });
    
    // Cleanup function to cancel ongoing requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      fetchingRef.current = false;
    };
  }, [chatId, fetchMessages]);

  // Add a new message — removes matching optimistic, skips duplicates
  const addMessage = useCallback((msg) => {
    setMessages((prev) => {
      // Remove optimistic placeholder that matches this real message
      const withoutOptimistic = prev.filter((m) => {
        if (!m._optimistic) return true;
        const sameContent = m.content === msg.content;
        const sameSender = toIdString(m.senderId) === toIdString(msg.senderId);
        const recentEnough = Math.abs(Date.now() - new Date(m.createdAt).getTime()) < 15000;
        return !(sameContent && sameSender && recentEnough);
      });
      // Skip if _id already present
      if (withoutOptimistic.some((m) => m._id === msg._id)) return withoutOptimistic;
      return [...withoutOptimistic, msg];
    });
  }, []);

  // Merge updated fields into existing message
  const updateMessage = useCallback((patchOrFn) => {
    setMessages((prev) => {
      let changed = false;

      const next = prev.map((m) => {
        if (typeof patchOrFn === 'function') {
          // If it's a function, it takes the old message and returns the patch/full message
          const result = patchOrFn(m);
          if (!result || result._id !== m._id) return m;

          const merged = { ...m, ...result };
          if (merged === m) return m;

          const sameKeys = Object.keys(merged).every((key) => merged[key] === m[key]);
          if (sameKeys) return m;

          changed = true;
          return merged;
        }

        if (m._id !== patchOrFn._id) return m;

        const merged = { ...m, ...patchOrFn };
        const sameKeys = Object.keys(merged).every((key) => merged[key] === m[key]);
        if (sameKeys) return m;

        changed = true;
        return merged;
      });

      return changed ? next : prev;
    });
  }, []);

  const removeMessage = useCallback((messageId) => {
    if (!messageId) return;
    setMessages((prev) => prev.filter((m) => m._id !== messageId));
  }, []);

  const loadMore = useCallback(async () => {
    if (!loading && hasMore && cursor) {
      await fetchMessages({ nextCursor: cursor, append: true });
    }
  }, [loading, hasMore, cursor, fetchMessages]);

  return { messages, loading, hasMore, addMessage, updateMessage, removeMessage, loadMore };
};
