import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearPersistedTrip } from './TripContext';

const API_BASE = 'http://localhost:4000';

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 새로고침해도 로그인 유지: 저장된 토큰으로 내 정보 재조회
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAuthResponse(res: Response) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '요청에 실패했어요.');
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    await handleAuthResponse(res);
  }

  async function signup(email: string, password: string, name: string) {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    await handleAuthResponse(res);
  }

  function logout() {
    localStorage.removeItem('token');
    clearPersistedTrip(); // 다음 사용자가 이전 사용자 데이터를 보지 않도록
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
