import { API_BASE_URL } from './apiBase';

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했어요.');
  return data;
}

export async function findAccountEmail(name: string, password: string): Promise<string> {
  const result = await post<{ email: string }>('/api/auth/find-email', { name, password });
  return result.email;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const result = await post<{ message: string }>('/api/auth/password-reset/request', { email });
  return result.message;
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<string> {
  const result = await post<{ message: string }>('/api/auth/password-reset/confirm', { token, newPassword });
  return result.message;
}
