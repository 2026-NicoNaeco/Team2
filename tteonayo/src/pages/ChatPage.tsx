import { useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar';
import { chatMessages as initialMessages } from '../data/mockData';
import { useTrip } from '../context/TripContext';
import type { ChatMessage, Place } from '../types';

const REPLY_TIMES = ['10:00', '13:00', '15:30', '18:00'];

// TODO: 실제 LLM(OpenAI API) 연동 지점. 지금은 저장한 장소 + 날씨를 반영한 형태의
// 응답을 규칙 기반으로 생성합니다 (POST /api/chat 로 교체 예정).
function buildAiReply(saved: Place[], all: Place[]): ChatMessage {
  const pool = saved.length >= 3 ? saved : all;
  const picks = pool.slice(0, 4);
  return {
    id: crypto.randomUUID(),
    sender: 'ai',
    text:
      saved.length > 0
        ? `저장하신 장소 ${saved.length}곳과 현재 순천 날씨(맑음 · 18°C)를 반영해 코스를 구성했어요. 필요한 장소는 "+ 다이어리"로 일정판에 담아보세요.`
        : '아직 저장한 장소가 없어서 인기 스팟 위주로 코스를 짜봤어요. 지도에서 장소를 저장하면 취향을 더 정확히 반영할 수 있어요.',
    course: picks.map((p, i) => ({ placeId: p.id, time: REPLY_TIMES[i] ?? '' })),
  };
}

export default function ChatPage() {
  const { places, savedIds, boardCards, addBoardCard } = useTrip();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const savedPlaces = places.filter((p) => savedIds.includes(p.id));
  const placeById = (id: string) => places.find((p) => p.id === id);
  const isOnBoard = (title: string) => boardCards.some((c) => c.title === title);

  const handleSend = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), sender: 'user', text }]);
    setInput('');
    setThinking(true);
    // 실제 API 응답을 흉내내기 위한 지연
    setTimeout(() => {
      setMessages((prev) => [...prev, buildAiReply(savedPlaces, places)]);
      setThinking(false);
    }, 700);
  };

  return (
    <>
      <Topbar title="AI 여정 설계 컨설팅" stamp={`📌 ${savedIds.length}개 장소 연동됨`} />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex gap-5 h-[calc(100vh-220px)]">
          {/* 채팅 창 */}
          <div className="flex-[1.4] bg-white border border-line rounded-2xl flex flex-col overflow-hidden">
            <div className="border-b border-line px-5 py-3 flex items-center gap-2 bg-paper">
              <span className="w-7 h-7 rounded-full bg-teal flex items-center justify-center text-white text-[13px] font-display font-bold">
                AI
              </span>
              <div className="leading-tight">
                <div className="text-[13px] font-semibold">떠나요 AI</div>
                <div className="text-[11px] text-teal">● 온라인</div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[78%] px-4 py-3 rounded-2xl text-[13.5px] leading-relaxed ${
                    msg.sender === 'ai'
                      ? 'bg-paper border border-line self-start rounded-bl-sm'
                      : 'bg-teal-deep text-white self-end rounded-br-sm'
                  }`}
                >
                  {msg.text}
                  {msg.course && msg.course.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="text-[11px] font-semibold text-pin">📍 추천 코스</div>
                      {msg.course.map(({ placeId, time }) => {
                        const place = placeById(placeId);
                        if (!place) return null;
                        const added = isOnBoard(place.name);
                        return (
                          <div
                            key={placeId}
                            className="bg-white border border-line rounded-xl px-3 py-2.5 flex items-center gap-3"
                          >
                            <span className="w-8 h-8 rounded-lg bg-sand flex items-center justify-center text-[15px] shrink-0">
                              {place.icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12.5px] font-semibold text-ink truncate">
                                {place.name}
                              </div>
                              <div className="text-[11px] text-[#8B8272] font-mono">{time}</div>
                            </div>
                            <button
                              disabled={added}
                              onClick={() =>
                                addBoardCard({
                                  day: '추천 코스',
                                  time,
                                  icon: place.icon,
                                  title: place.name,
                                  description: place.description,
                                })
                              }
                              className={`shrink-0 text-[11px] rounded-lg px-2.5 py-1.5 font-semibold border cursor-pointer transition-colors ${
                                added
                                  ? 'bg-[#E9F0E7] text-[#4C7A3F] border-[#E9F0E7] cursor-default'
                                  : 'bg-white text-teal-deep border-line hover:border-teal hover:text-teal'
                              }`}
                            >
                              {added ? '✓ 추가됨' : '+ 다이어리'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="self-start bg-paper border border-line rounded-2xl rounded-bl-sm px-4 py-3 text-[13px] text-[#8B8272]">
                  코스를 구성하는 중…
                </div>
              )}
            </div>

            <div className="border-t border-line px-4.5 py-3.5 flex gap-2.5 bg-white">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="실시간 날씨, 최적 동선, 예산 산출 등 무엇이든 물어보세요..."
                className="flex-1 border border-line rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-teal"
              />
              <button
                onClick={handleSend}
                className="bg-teal-deep text-white border-none rounded-[10px] px-5 text-[13px] cursor-pointer disabled:opacity-50"
                disabled={thinking}
              >
                질문하기
              </button>
            </div>
          </div>

          {/* 실시간 브리핑 패널 — TODO: 날씨/혼잡도/경비 실시간 API 연동 지점 */}
          <div className="w-[290px] shrink-0 flex flex-col gap-3 overflow-y-auto">
            {/* 날씨 */}
            <div className="rounded-2xl p-4 text-paper bg-gradient-to-br from-teal to-teal-deep shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] opacity-80">순천 · 오늘</div>
                  <div className="text-[32px] font-display font-semibold leading-none mt-1.5">
                    18°C
                  </div>
                  <div className="text-[12.5px] mt-2">맑음 · 체감 17°</div>
                </div>
                <div className="text-[40px] leading-none">🌤</div>
              </div>
            </div>

            {/* 혼잡도 + 경비 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-line bg-white p-3.5">
                <div className="text-[10px] text-[#8B8272] uppercase tracking-wide">정원 혼잡도</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal" />
                  <span className="text-[18px] font-display font-semibold text-teal-deep leading-none">
                    여유
                  </span>
                </div>
                <div className="text-[10px] text-[#8B8272] mt-1.5">지금 방문 추천</div>
              </div>
              <div className="rounded-2xl border border-line bg-white p-3.5">
                <div className="text-[10px] text-[#8B8272] uppercase tracking-wide">AI 산출 경비</div>
                <div className="mt-2 text-[17px] font-display font-semibold text-ink leading-none">
                  ₩180,000
                </div>
                <div className="text-[10px] text-[#8B8272] mt-1.5">2박 3일 · 1인</div>
              </div>
            </div>

            {/* 저장 장소 */}
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="m-0 text-[12px] font-semibold text-ink">AI 반영 저장 장소</h4>
                <span className="text-[11px] font-semibold text-teal-deep bg-sand rounded-full px-2 py-0.5">
                  {savedPlaces.length}곳
                </span>
              </div>
              {savedPlaces.length === 0 ? (
                <p className="m-0 text-[11.5px] text-[#8B8272] leading-relaxed">
                  지도에서 장소를 저장하면 여기에 표시되고 코스 추천에 반영돼요.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {savedPlaces.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className="w-6 h-6 rounded-md bg-paper flex items-center justify-center text-[13px] shrink-0">
                        {p.icon}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 학습 취향 */}
            <div className="rounded-2xl border border-line bg-white p-4">
              <h4 className="m-0 mb-2.5 text-[12px] font-semibold text-ink">분석된 학습 취향</h4>
              <div className="flex flex-wrap gap-1.5">
                {['조용한 골목', '감성 카페', '도보 선호', '자연 코스'].map((t) => (
                  <span
                    key={t}
                    className="text-[11px] bg-sand text-teal-deep rounded-full px-2.5 py-1"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
