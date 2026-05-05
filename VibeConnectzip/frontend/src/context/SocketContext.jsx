import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export const SocketProvider = ({ children, userId }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!userId) return;

    const s = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => {
      setConnected(true);
      s.emit('user_connected', { userId });
    });

    s.on('disconnect', () => setConnected(false));

    s.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
