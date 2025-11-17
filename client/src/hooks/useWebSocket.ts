import { useCallback, useEffect, useRef, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_CONFIG, WEBSOCKET_CONFIG } from '../lib/config';

interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp: Date;
}

export function useWebSocket(url: string = API_CONFIG.BASE_URL) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Create socket connection
    const socket = io(url, {
      transports: [...WEBSOCKET_CONFIG.TRANSPORTS],
      reconnection: true,
      reconnectionDelay: WEBSOCKET_CONFIG.RECONNECTION_DELAY,
      reconnectionAttempts: WEBSOCKET_CONFIG.RECONNECTION_ATTEMPTS,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      toast.success('Connected to server', {
        description: 'Real-time updates are active',
      });
      setConnected(true);
    });

    socket.on('disconnect', () => {
      toast.warning('Disconnected from server', {
        description: 'Trying to reconnect...',
      });
      setConnected(false);
    });

    // Message handlers
    socket.on('metrics:update', (data) => {
      setLastMessage({
        type: 'metrics:update',
        data,
        timestamp: new Date(),
      });
    });

    socket.on('alert:triggered', (data) => {
      setLastMessage({
        type: 'alert:triggered',
        data,
        timestamp: new Date(),
      });
    });

    socket.on('pool:status', (data) => {
      setLastMessage({
        type: 'pool:status',
        data,
        timestamp: new Date(),
      });
    });

    socket.on('container:status', (data) => {
      setLastMessage({
        type: 'container:status',
        data,
        timestamp: new Date(),
      });
    });

    socket.on('security:status', (data) => {
      setLastMessage({
        type: 'security:status',
        data,
        timestamp: new Date(),
      });
    });

    socket.on('arr:status', (data) => {
      setLastMessage({
        type: 'arr:status',
        data,
        timestamp: new Date(),
      });
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, [url]);

  // Send message
  const sendMessage = useCallback((event: string, data: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  // Subscribe to specific event
  const subscribe = useCallback((event: string, handler: (data: unknown) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, handler);

      // Return unsubscribe function
      return () => {
        socketRef.current?.off(event, handler);
      };
    }
  }, []);

  return {
    connected,
    lastMessage,
    sendMessage,
    subscribe,
  };
}
