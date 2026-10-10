import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';
import { fetchRegionWeather, type RegionWeather } from '../services/weather';
import { findDomesticRegions, searchDomesticRegions, type RegionOption } from '../services/domesticRegions';
import type { ChatConversation, ChatMessage } from '../types';

type WeatherState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; value: RegionWeather }
  | { status: 'error'; message: string };

export default function ChatPage() {
  const navigate = useNavigate();
  const { chatConversations: conversations, setChatConversations: setConversations } = useTrip();
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const [newRegion, setNewRegion] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionOption | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [remoteResult, setRemoteResult] = useState<{ query: string; regions: RegionOption[] } | null>(null);
  const [regionSearchError, setRegionSearchError] = useState<{ query: string; message: string } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [input, setInput] = useState('');
  const [weather, setWeather] = useState<WeatherState>({ status: 'idle' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((item) => item.id === selectedId) ?? null;
  const ordered = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const regionQuery = newRegion.trim();
  const suggestions = useMemo(() => findDomesticRegions(
    regionQuery,
    remoteResult?.query === regionQuery ? remoteResult.regions : [],
  ), [regionQuery, remoteResult]);

  useEffect(() => {
    if (!showNewForm || regionQuery.length < 2 || regionQuery.length > 50) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchDomesticRegions(regionQuery, controller.signal)
        .then((regions) => {
          setRemoteResult({ query: regionQuery, regions });
          setRegionSearchError(null);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setRegionSearchError({
            query: regionQuery,
            message: error instanceof Error ? error.message : '지역을 검색하지 못했습니다.',
          });
        });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [regionQuery, showNewForm]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active?.messages.length, selectedId]);

  useEffect(() => {
    if (!active?.region) {
      setWeather({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setWeather({ status: 'loading' });
    fetchRegionWeather(active.region, controller.signal, {
      countryCode: active.regionCountryCode,
      coordinates: active.regionCoordinates,
    })
      .then((value) => setWeather({ status: 'success', value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setWeather({ status: 'error', message: error instanceof Error ? error.message : '날씨를 불러오지 못했습니다.' });
      });
    return () => controller.abort();
  }, [active?.region, active?.regionCountryCode, active?.regionCoordinates]);

  const chooseRegion = (option: RegionOption) => {
    setNewRegion(option.name);
    setSelectedRegion(option);
    setShowSuggestions(false);
    setSuggestionIndex(0);
  };

  const createConversation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRegion || selectedRegion.name !== newRegion.trim()) return;
    const region = selectedRegion.name;
    const now = new Date().toISOString();
    const conversation: ChatConversation = {
      id: crypto.randomUUID(), region, title: `${region} 여행`,
      regionCountryCode: 'KR',
      regionCoordinates: selectedRegion.coordinates,
      messages: [], createdAt: now, updatedAt: now,
    };
    setConversations((previous) => [conversation, ...previous]);
    setSelectedId(conversation.id);
    setNewRegion('');
    setSelectedRegion(null);
    setInput('');
    setShowNewForm(false);
  };

  const deleteConversation = (id: string) => {
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation || !window.confirm(`'${conversation.title}' 대화를 삭제할까요?`)) return;
    const next = conversations.filter((item) => item.id !== id);
    setConversations(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!active || !text || text.length > 2000) return;
    const now = new Date().toISOString();
    const message: ChatMessage = { id: crypto.randomUUID(), sender: 'user', text, createdAt: now };
    setConversations((previous) => previous.map((item) => item.id === active.id
      ? { ...item, messages: [...item.messages, message], updatedAt: now }
      : item
    ));
    setInput('');
  };

  return (
    <>
      <Topbar title="여행 AI 채팅" stamp={active ? active.region : '새 여행 시작'} />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
        <div className="h-full min-h-[360px] flex flex-col lg:flex-row gap-4">
          <aside className="w-full lg:w-[200px] xl:w-[220px] shrink-0 bg-white border border-line rounded-2xl p-3 flex flex-col gap-3 lg:max-h-full">
            <button type="button" onClick={() => setShowNewForm((value) => !value)}
              className="w-full rounded-xl bg-teal-deep text-white py-2.5 text-sm font-semibold cursor-pointer border-none">＋ 새 지역 대화</button>
            {showNewForm && (
              <form onSubmit={createConversation} className="rounded-xl bg-paper p-3 flex flex-col gap-2">
                <label htmlFor="new-chat-region" className="text-xs font-semibold text-teal-deep">가고 싶은 지역</label>
                <input id="new-chat-region" autoFocus value={newRegion} maxLength={50}
                  role="combobox" aria-autocomplete="list" aria-controls="region-suggestions"
                  aria-expanded={showSuggestions && regionQuery.length > 0}
                  aria-activedescendant={showSuggestions && suggestions.length ? `region-option-${Math.min(suggestionIndex, suggestions.length - 1)}` : undefined}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={(event) => {
                    setNewRegion(event.target.value);
                    setSelectedRegion(null);
                    setShowSuggestions(true);
                    setSuggestionIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' && suggestions.length) {
                      event.preventDefault();
                      setShowSuggestions(true);
                      setSuggestionIndex((index) => (index + 1) % suggestions.length);
                    } else if (event.key === 'ArrowUp' && suggestions.length) {
                      event.preventDefault();
                      setShowSuggestions(true);
                      setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                    } else if (event.key === 'Enter' && showSuggestions && suggestions.length) {
                      event.preventDefault();
                      chooseRegion(suggestions[Math.min(suggestionIndex, suggestions.length - 1)]);
                    } else if (event.key === 'Enter' && !selectedRegion) {
                      event.preventDefault();
                    } else if (event.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                  placeholder="예: 순천, 제주, 강릉" className="w-full box-border rounded-lg border border-line bg-white px-3 py-2 text-sm outline-teal" />
                {showSuggestions && regionQuery && (
                  <div id="region-suggestions" role="listbox" aria-label="국내 지역 검색 결과"
                    className="max-h-48 overflow-y-auto rounded-lg border border-line bg-white">
                    {suggestions.length ? suggestions.map((option, index) => (
                      <button key={`${option.name}:${option.area ?? ''}`} id={`region-option-${index}`}
                        type="button" role="option" aria-selected={index === suggestionIndex}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseRegion(option)}
                        className={`block w-full border-none px-3 py-2 text-left text-xs cursor-pointer ${index === suggestionIndex ? 'bg-paper text-teal-deep' : 'bg-white text-ink-soft hover:bg-paper'}`}>
                        <span className="font-semibold">{option.name}</span>
                        {option.area && <span className="ml-1 text-muted">{option.area}</span>}
                      </button>
                    )) : (
                      <p className="m-0 px-3 py-2 text-xs text-muted">
                        {regionSearchError?.query === regionQuery ? regionSearchError.message
                          : remoteResult?.query === regionQuery ? '일치하는 국내 지역이 없어요.' : '국내 지역을 찾는 중이에요.'}
                      </p>
                    )}
                  </div>
                )}
                <p className="m-0 text-[11px] text-muted">목록에서 지역을 선택하면 대화를 만들 수 있어요.</p>
                <button type="submit" disabled={!selectedRegion || selectedRegion.name !== newRegion.trim()}
                  className="rounded-lg bg-teal text-white py-2 text-xs cursor-pointer border-none disabled:opacity-50">대화 만들기</button>
              </form>
            )}
            <div className="text-[11px] font-semibold text-muted px-2">이전 대화 · {conversations.length}개</div>
            {ordered.length ? (
              <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto lg:min-h-0">
                {ordered.map((conversation) => (
                  <div key={conversation.id} className={`min-w-[150px] lg:min-w-0 rounded-xl flex items-center gap-1 ${selectedId === conversation.id ? 'bg-paper' : 'hover:bg-paper'}`}>
                    <button type="button" onClick={() => { setSelectedId(conversation.id); setInput(''); }}
                      className="min-w-0 flex-1 bg-transparent border-none text-left px-3 py-2.5 cursor-pointer">
                      <span className="block truncate text-sm font-semibold text-teal-deep">{conversation.title}</span>
                      <span className="block truncate mt-1 text-[11px] text-muted">{conversation.messages.at(-1)?.text ?? '아직 대화가 없어요'}</span>
                    </button>
                    <button type="button" onClick={() => deleteConversation(conversation.id)} aria-label={`${conversation.title} 삭제`}
                      className="shrink-0 mr-2 text-muted hover:text-pin bg-transparent border-none cursor-pointer">✕</button>
                  </div>
                ))}
              </div>
            ) : <p className="m-0 px-2 text-xs text-muted">새 지역 대화를 만들어 시작하세요.</p>}
            <p className="mt-auto m-0 px-2 text-[11px] leading-relaxed text-muted">대화 기록은 현재 이 브라우저에 저장됩니다.</p>
          </aside>

          <main className="min-w-0 flex-1 min-h-[360px] lg:min-h-0 bg-white border border-line rounded-2xl flex flex-col overflow-hidden">
            {active ? (
              <>
                <div className="shrink-0 border-b border-line px-5 py-4 bg-paper">
                  <h1 className="m-0 font-display text-[18px] font-semibold text-ink">{active.title}</h1>
                  <p className="m-0 mt-1 text-xs text-muted">지역: {active.region} · AI 답변 기능은 서버 연결 전입니다</p>
                </div>
                <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 flex flex-col gap-4">
                  <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-paper border border-line px-4 py-3 text-sm leading-relaxed text-ink-soft">
                    {active.region} 여행에 관해 궁금한 점을 적어두세요. 현재 질문은 이 브라우저에 저장되며, AI 답변은 연결 후 이용할 수 있습니다.
                  </div>
                  {active.messages.map((message) => (
                    <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${message.sender === 'user' ? 'self-end rounded-br-sm bg-teal-deep text-white' : 'self-start rounded-bl-sm bg-paper border border-line text-ink-soft'}`}>
                      {message.text}
                    </div>
                  ))}
                </div>
                <div className="shrink-0 border-t border-line p-3 sm:p-4 bg-white">
                  <div className="flex items-end gap-2">
                    <textarea value={input} maxLength={2000} rows={2}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
                      placeholder={`${active.region} 여행에 대한 질문을 적어보세요`}
                      className="min-w-0 flex-1 resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed outline-teal" />
                    <button type="button" onClick={sendMessage} disabled={!input.trim()}
                      className="shrink-0 rounded-xl bg-teal-deep text-white px-4 py-3 text-sm font-semibold cursor-pointer border-none disabled:opacity-50">저장</button>
                  </div>
                  <p className="m-0 mt-2 text-[11px] text-muted">Enter로 저장 · Shift+Enter로 줄바꿈 · 실제 AI 응답은 아직 제공되지 않습니다.</p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
                <h1 className="m-0 font-display text-xl text-ink">어디로 떠나고 싶으세요?</h1>
                <p className="m-0 text-sm text-muted">왼쪽에서 지역별 대화를 만들면 여행 기록과 정보를 한곳에서 볼 수 있어요.</p>
                <button type="button" onClick={() => setShowNewForm(true)} className="rounded-xl bg-teal-deep text-white px-4 py-2.5 text-sm cursor-pointer border-none">새 지역 대화 만들기</button>
              </div>
            )}
          </main>

          {active && (
            <aside className="w-full lg:w-[230px] xl:w-[250px] shrink-0 flex flex-col gap-3 lg:max-h-full lg:overflow-y-auto">
              <div className="rounded-2xl bg-teal-deep text-paper p-4">
                <div className="text-xs opacity-80">{active.region} · 현재 날씨</div>
                {weather.status === 'loading' && <p className="m-0 mt-3 text-sm">날씨를 불러오는 중…</p>}
                {weather.status === 'success' && (
                  <>
                    <div className="mt-3 font-display text-[30px] font-semibold">{Math.round(weather.value.temperature)}°C</div>
                    <div className="text-sm">{weather.value.condition}</div>
                    <div className="mt-2 text-[11px] opacity-80">{weather.value.location} · Open-Meteo</div>
                  </>
                )}
                {weather.status === 'error' && <p className="m-0 mt-3 text-xs leading-relaxed">{weather.message}</p>}
              </div>
              <div className="rounded-2xl bg-white border border-line p-4">
                <h2 className="m-0 text-sm font-semibold text-ink">유명 관광지 혼잡도</h2>
                <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{active.region} 관광지별 실시간 혼잡도 데이터는 아직 연결되지 않았어요.</p>
              </div>
              <div className="rounded-2xl bg-white border border-line p-4">
                <h2 className="m-0 text-sm font-semibold text-ink">숙소 평균 금액</h2>
                <p className="m-0 mt-2 text-xs leading-relaxed text-muted">{active.region} 숙소 가격은 추후 숙박 데이터 API를 연결한 뒤 표시됩니다.</p>
              </div>
              <button type="button" onClick={() => navigate('/map')} className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-teal-deep font-semibold cursor-pointer">지도에서 장소 저장하기 →</button>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
