import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';

export function useWebSocket() {
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        // Reconnect with backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (e) {
      console.error('WS connection error:', e);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { isConnected, lastMessage };
}
