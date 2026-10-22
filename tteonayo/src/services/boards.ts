import type { BoardApiData, BoardApiResponse, BoardListResponse } from '../types';
import { API_BASE_URL } from './apiBase';

export class BoardApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, method = 'GET', body?: object): Promise<BoardApiResponse> {
  const token = localStorage.getItem('token');
  if (!token) throw new BoardApiError(401, '다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/boards${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new BoardApiError(0, '서버에 연결하지 못했어요. 네트워크를 확인해 주세요.');
  }
  const payload = await response.json().catch(() => ({})) as Partial<BoardApiResponse> & { error?: string };
  if (!response.ok || !payload.board) {
    throw new BoardApiError(response.status, payload.error || '일정판을 처리하지 못했어요.');
  }
  return { board: payload.board };
}

export async function getBoard(boardId: string) {
  return (await request(`/${encodeURIComponent(boardId)}`)).board;
}

export async function createBoard(title: string, data: BoardApiData) {
  return (await request('', 'POST', { title, data })).board;
}

export async function updateBoard(boardId: string, expectedVersion: number, title: string, data: BoardApiData) {
  return (await request(`/${encodeURIComponent(boardId)}`, 'PUT', { expectedVersion, title, data })).board;
}

export async function addBoardMember(boardId: string, email: string) {
  return (await request(`/${encodeURIComponent(boardId)}/members`, 'POST', { email })).board;
}

export async function removeBoardMember(boardId: string, userId: number) {
  const token = localStorage.getItem('token');
  if (!token) throw new BoardApiError(401, '다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/boards/${encodeURIComponent(boardId)}/members/${userId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new BoardApiError(0, '서버에 연결하지 못했어요. 네트워크를 확인해 주세요.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new BoardApiError(response.status, payload.error || '참여자를 제거하지 못했어요.');
  }
}

export async function listBoards() {
  const token = localStorage.getItem('token');
  if (!token) throw new BoardApiError(401, '다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/boards`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new BoardApiError(0, '서버에 연결하지 못했어요. 네트워크를 확인해 주세요.');
  }
  const payload = await response.json().catch(() => ({})) as Partial<BoardListResponse> & { error?: string };
  if (!response.ok || !Array.isArray(payload.boards)) {
    throw new BoardApiError(response.status, payload.error || '일정판 목록을 불러오지 못했어요.');
  }
  return payload.boards;
}

export async function deleteBoard(boardId: string) {
  const token = localStorage.getItem('token');
  if (!token) throw new BoardApiError(401, '다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/boards/${encodeURIComponent(boardId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new BoardApiError(0, '서버에 연결하지 못했어요. 네트워크를 확인해 주세요.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new BoardApiError(response.status, payload.error || '일정판을 삭제하지 못했어요.');
  }
}
