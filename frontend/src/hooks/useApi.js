import { useState, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '';

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

  const put = useCallback(
    (path, body) =>
      request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    [request]
  );

  const del = useCallback(
    (path) => request(path, { method: 'DELETE' }),
    [request]
  );

  return { get, post, put, del, loading };
}
