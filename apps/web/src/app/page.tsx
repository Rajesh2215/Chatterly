'use client';

import { useEffect, useState } from 'react';

interface HealthData {
  status: string;
  services: {
    mongodb: string;
    redis: string;
  };
  uptime: number;
  timestamp: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Note: Check if your server runs on 5001 or 3000 based on your .env
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [API_URL]);

  return (
    <main style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#f8fafc',
      padding: '2rem'
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '2.5rem',
        maxWidth: '540px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '2rem' }}>💬</span>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Chatterly</h1>
        </div>

        <p style={{ color: '#94a3b8', marginTop: 0, marginBottom: '2rem', lineHeight: 1.5 }}>
          Real-time messaging platform foundation. Client, API, MongoDB Replica Set, and Redis are online.
        </p>

        {loading && <p style={{ color: '#38bdf8' }}>Connecting to API...</p>}

        {error && (
          <div style={{ background: '#451a1a', border: '1px solid #b91c1c', padding: '1rem', borderRadius: '8px', color: '#fca5a5' }}>
            <strong>Connection Error:</strong> {error}
            <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>Make sure Express is running on {API_URL}</div>
          </div>
        )}

        {health && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#0f172a', borderRadius: '8px' }}>
              <span>Express API</span>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>● {health.status.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#0f172a', borderRadius: '8px' }}>
              <span>MongoDB Replica Set (rs0)</span>
              <span style={{ color: health.services.mongodb === 'healthy' ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                ● {health.services.mongodb}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#0f172a', borderRadius: '8px' }}>
              <span>Redis Cache / PubSub</span>
              <span style={{ color: health.services.redis === 'healthy' ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                ● {health.services.redis}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '8px', textAlign: 'center' }}>
              Uptime: {Math.round(health.uptime)}s | {health.timestamp}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
