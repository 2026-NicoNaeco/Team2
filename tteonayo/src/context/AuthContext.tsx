import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { API_BASE_URL } from '../services/apiBase';

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
  updateName: (name: string) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
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
    fetch(`${API_BASE_URL}/api/auth/me`, {
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
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    await handleAuthResponse(res);
  }

  async function signup(email: string, password: string, name: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    await handleAuthResponse(res);
  }

  async function updateName(name: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      body: JSON.stringify({ name }),
    });
    const data = await res.json() as { user?: User; error?: string };
    if (!res.ok || !data.user) throw new Error(data.error || '닉네임을 변경하지 못했어요.');
    setUser(data.user);
    return data.user;
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json() as { token?: string; user?: User; error?: string };
    if (!res.ok || !data.token || !data.user) throw new Error(data.error || '비밀번호를 변경하지 못했어요.');
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  async function deleteAccount(password: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
      body: JSON.stringify({ password }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) throw new Error(data.error || '계정을 삭제하지 못했어요.');
    if (user) {
      const tripPrefix = `tteonayo:trip:user:${user.id}:`;
      const exactKeys = new Set([`tteonayo:chat:${user.id}`, `tteonayo:board-draft-title:${user.id}`,
        'tteonayo:trip', 'tteonayo:trip:v1', 'tteonayo:trip:v2', 'tteonayo:trip:v3', 'tteonayo:trip:v4']);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(tripPrefix) || exactKeys.has(key)) localStorage.removeItem(key);
      }
    }
    localStorage.removeItem('token');
    setUser(null);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, updateName, changePassword, deleteAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
