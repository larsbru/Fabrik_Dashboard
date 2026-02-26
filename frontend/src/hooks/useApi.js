import { useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export function useApi() {
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (path, options = {}) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`API error [${path}]:`, error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((path) => request(path), [request]);

  const post = useCallback(
    (path, body) =>
      request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    [request]
  );

  return { get, post, loading };
}
