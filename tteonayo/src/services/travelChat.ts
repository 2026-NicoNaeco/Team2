import type { ChatMessage } from '../types';
import type { RegionWeather } from './weather';
import { API_BASE_URL } from './apiBase';

interface ReplyRequest {
  region: string;
  messages: Pick<ChatMessage, 'sender' | 'text'>[];
  weather?: RegionWeather;
}

export async function requestTravelReply({ region, messages, weather }: ReplyRequest): Promise<{ answer: string; sources: { title: string; url: string }[] }> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('다시 로그인해 주세요.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/chat/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ region, messages: messages.slice(-20), weather }),
    });
  } catch {
    throw new Error('서버에 연결하지 못했어요. 실행 상태를 확인해 주세요.');
  }
  const payload = await response.json() as { answer?: string; sources?: { title: string; url: string }[]; error?: string };
  if (!response.ok) throw new Error(payload.error || 'AI 답변을 불러오지 못했어요.');
  if (!payload.answer) throw new Error('AI 답변이 비어 있어요. 다시 시도해 주세요.');
  return { answer: payload.answer, sources: payload.sources ?? [] };
}
