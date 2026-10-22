import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';
import { fetchRegionWeather, type RegionWeather } from '../services/weather';
import { findDomesticRegions, searchDomesticRegions, type RegionOption } from '../services/domesticRegions';
import { requestTravelReply } from '../services/travelChat';
import { fetchSeoulCongestion, type SeoulCongestionResponse } from '../services/seoulCongestion';
import type { ChatConversation, ChatMessage } from '../types';

type WeatherState =
  | { status: 'idle' | 'loading' }
  | { status: 'success'; region: string; value: RegionWeather }
  | { status: 'error'; message: string };

type CongestionState =
  | { status: 'idle' }
  | { status: 'success'; place: string; value: SeoulCongestionResponse }
  | { status: 'error'; place: string; message: string };

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
  const [congestionCatalog, setCongestionCatalog] = useState<
    { status: 'idle' } | { status: 'success'; value: SeoulCongestionResponse } | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [congestion, setCongestion] = useState<CongestionState>({ status: 'idle' });
  const [selectedPlaceByChat, setSelectedPlaceByChat] = useState<Record<string, string>>({});
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<{ conversationId: string; message: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = conversations.find((item) => item.id === selectedId) ?? null;
  const availablePlaces = congestionCatalog.status === 'success' ? congestionCatalog.value.availablePlaces : [];
  const mentionedPlace = active?.region === '서울' ? [...active.messages].reverse()
    .filter((message) => message.sender === 'user')
    .map((message) => availablePlaces.find((place) => message.text.includes(place)))
    .find(Boolean) : undefined;
  const focusedPlace = active?.region === '서울' ? selectedPlaceByChat[active.id] || mentionedPlace || '' : '';
  const sending = pendingConversationId !== null;
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
    const weatherRegion = active.region;
    fetchRegionWeather(weatherRegion, controller.signal, {
      countryCode: active.regionCountryCode,
      coordinates: active.regionCoordinates,
    })
      .then((value) => setWeather({ status: 'success', region: weatherRegion, value }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setWeather({ status: 'error', message: error instanceof Error ? error.message : '날씨를 불러오지 못했습니다.' });
      });
    return () => controller.abort();
  }, [active?.region, active?.regionCountryCode, active?.regionCoordinates]);

  useEffect(() => {
    if (active?.region !== '서울') return;
    const controller = new AbortController();
    fetchSeoulCongestion(null, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setCongestionCatalog({ status: 'success', value }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCongestionCatalog({ status: 'error', message: error instanceof Error ? error.message : '관광지 목록을 불러오지 못했어요.' });
      });
    return () => controller.abort();
  }, [active?.region]);

  useEffect(() => {
    if (!focusedPlace) return;
    const controller = new AbortController();
    fetchSeoulCongestion(focusedPlace, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setCongestion({ status: 'success', place: focusedPlace, value }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCongestion({ status: 'error', place: focusedPlace, message: error instanceof Error ? error.message : '혼잡도를 불러오지 못했어요.' });
      });
    return () => controller.abort();
  }, [focusedPlace]);

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

  const askGuide = async (conversation: ChatConversation, messages: ChatMessage[]) => {
    setPendingConversationId(conversation.id);
    setReplyError(null);
    try {
      const result = await requestTravelReply({
        region: conversation.region, messages,
        weather: weather.status === 'success' && weather.region === conversation.region ? weather.value : undefined,
      });
      const now = new Date().toISOString();
      const reply: ChatMessage = { id: crypto.randomUUID(), sender: 'ai', text: result.answer, sources: result.sources, createdAt: now };
      setConversations((previous) => previous.map((item) => item.id === conversation.id
        ? { ...item, messages: [...item.messages, reply], updatedAt: now }
        : item
      ));
    } catch (error) {
      setReplyError({ conversationId: conversation.id,
        message: error instanceof Error ? error.message : 'AI 답변을 불러오지 못했어요.' });
    } finally {
      setPendingConversationId(null);
    }
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!active || !text || text.length > 2000 || sending) return;
    const placeInMessage = active.region === '서울' ? availablePlaces.find((place) => text.includes(place)) : undefined;
    if (placeInMessage) setSelectedPlaceByChat((previous) => ({ ...previous, [active.id]: placeInMessage }));
    const now = new Date().toISOString();
    const message: ChatMessage = { id: crypto.randomUUID(), sender: 'user', text, createdAt: now };
    setConversations((previous) => previous.map((item) => item.id === active.id
      ? { ...item, messages: [...item.messages, message], updatedAt: now }
      : item
    ));
    setInput('');
    void askGuide(active, [...active.messages, message]);
  };

  const retryReply = () => {
    if (!active || sending || active.messages.at(-1)?.sender !== 'user') return;
    void askGuide(active, active.messages);
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
                <p className="m-0 text-[length:calc(11px*var(--font-scale))] text-muted">목록에서 지역을 선택하면 대화를 만들 수 있어요.</p>
                <button type="submit" disabled={!selectedRegion || selectedRegion.name !== newRegion.trim()}
                  className="rounded-lg bg-teal text-white py-2 text-xs cursor-pointer border-none disabled:opacity-50">대화 만들기</button>
              </form>
            )}
            <div className="text-[length:calc(11px*var(--font-scale))] font-semibold text-muted px-2">이전 대화 · {conversations.length}개</div>
            {ordered.length ? (
              <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto lg:min-h-0">
                {ordered.map((conversation) => (
                  <div key={conversation.id} className={`min-w-[150px] lg:min-w-0 rounded-xl flex items-center gap-1 ${selectedId === conversation.id ? 'bg-paper' : 'hover:bg-paper'}`}>
                    <button type="button" onClick={() => { setSelectedId(conversation.id); setInput(''); }}
                      className="min-w-0 flex-1 bg-transparent border-none text-left px-3 py-2.5 cursor-pointer">
                      <span className="block truncate text-sm font-semibold text-teal-deep">{conversation.title}</span>
                      <span className="block truncate mt-1 text-[length:calc(11px*var(--font-scale))] text-muted">{conversation.messages.at(-1)?.text ?? '아직 대화가 없어요'}</span>
                    </button>
                    <button type="button" onClick={() => deleteConversation(conversation.id)} aria-label={`${conversation.title} 삭제`}
                      className="shrink-0 mr-2 text-muted hover:text-pin bg-transparent border-none cursor-pointer">✕</button>
                  </div>
                ))}
              </div>
            ) : <p className="m-0 px-2 text-xs text-muted">새 지역 대화를 만들어 시작하세요.</p>}
            <p className="mt-auto m-0 px-2 text-[length:calc(11px*var(--font-scale))] leading-relaxed text-muted">대화 기록은 로그인 계정에 저장됩니다.</p>
          </aside>

          <main className="min-w-0 flex-1 min-h-[360px] lg:min-h-0 bg-white border border-line rounded-2xl flex flex-col overflow-hidden">
            {active ? (
              <>
                <div className="shrink-0 border-b border-line px-5 py-4 bg-paper">
                  <h1 className="m-0 font-display text-[length:calc(18px*var(--font-scale))] font-semibold text-ink">{active.title}</h1>
                  <p className="m-0 mt-1 text-xs text-muted">지역: {active.region} · 여행 가이드 AI</p>
                </div>
                <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6 flex flex-col gap-4">
                  <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-paper border border-line px-4 py-3 text-sm leading-relaxed text-ink-soft">
                    {active.region} 여행에 관해 물어보세요. 확인되지 않은 가격이나 이동시간은 사실처럼 답하지 않아요.
                  </div>
                  {active.messages.map((message) => (
                    <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${message.sender === 'user' ? 'self-end rounded-br-sm bg-teal-deep text-white' : 'self-start rounded-bl-sm bg-paper border border-line text-ink-soft'}`}>
                      {message.text}
                      {message.sender === 'ai' && Boolean(message.sources?.length) && <div className="mt-3 border-t border-line pt-2 text-xs">
                        <span className="text-muted">검색 출처</span>
                        <ul className="m-0 mt-1 list-none p-0 flex flex-col gap-1">
                          {message.sources?.map((source) => <li key={source.url}>
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-teal-deep underline break-all">{source.title}</a>
                          </li>)}
                        </ul>
                      </div>}
                    </div>
                  ))}
                  {pendingConversationId === active.id && <p className="self-start m-0 text-xs text-muted" role="status">답변을 작성하는 중이에요…</p>}
                </div>
                <div className="shrink-0 border-t border-line p-3 sm:p-4 bg-white">
                  {replyError?.conversationId === active.id && <div role="alert" className="mb-3 flex items-center justify-between gap-3 text-xs text-pin">
                    <span>{replyError.message}</span>
                    {active.messages.at(-1)?.sender === 'user' &&
                      <button type="button" onClick={retryReply} disabled={sending}
                        className="shrink-0 rounded-lg border border-line bg-white px-2 py-1 text-teal-deep cursor-pointer disabled:opacity-50">답변 다시 받기</button>}
                  </div>}
                  <div className="flex items-end gap-2">
                    <textarea value={input} maxLength={2000} rows={2}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }}
                      placeholder={`${active.region} 여행에 대한 질문을 적어보세요`}
                      className="min-w-0 flex-1 resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm leading-relaxed outline-teal" />
                    <button type="button" onClick={sendMessage} disabled={!input.trim() || sending}
                      className="shrink-0 rounded-xl bg-teal-deep text-white px-4 py-3 text-sm font-semibold cursor-pointer border-none disabled:opacity-50">{sending ? '답변 중' : '보내기'}</button>
                  </div>
                  <p className="m-0 mt-2 text-[length:calc(11px*var(--font-scale))] text-muted">Enter로 보내기 · Shift+Enter로 줄바꿈</p>
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
                    <div className="mt-3 font-display text-[length:calc(30px*var(--font-scale))] font-semibold">{Math.round(weather.value.temperature)}°C</div>
                    <div className="text-sm">{weather.value.condition}</div>
                    <div className="mt-2 text-[length:calc(11px*var(--font-scale))] opacity-80">{weather.value.location} · Open-Meteo</div>
                  </>
                )}
                {weather.status === 'error' && <p className="m-0 mt-3 text-xs leading-relaxed">{weather.message}</p>}
              </div>
              <div className="rounded-2xl bg-white border border-line p-4">
                <h2 className="m-0 text-sm font-semibold text-ink">유명 관광지 혼잡도</h2>
                {active.region !== '서울' && <p className="m-0 mt-2 text-xs leading-relaxed text-muted">현재 서울 지역만 지원해요.</p>}
                {active.region === '서울' && congestionCatalog.status === 'idle' && <p className="m-0 mt-2 text-xs text-muted">관광지 목록을 불러오는 중…</p>}
                {active.region === '서울' && congestionCatalog.status === 'error' && <p role="alert" className="m-0 mt-2 text-xs text-muted">{congestionCatalog.message}</p>}
                {active.region === '서울' && congestionCatalog.status === 'success' && <>
                  <p id="congestion-place-label" className="m-0 mt-3 text-xs text-muted">혼잡도를 확인할 관광지 (서울시 제공 {availablePlaces.length}곳)</p>
                  <div role="group" aria-labelledby="congestion-place-label" className="mt-2 flex flex-wrap gap-1.5">
                    {availablePlaces.map((place) => (
                      <button key={place} type="button" aria-pressed={focusedPlace === place}
                        onClick={() => setSelectedPlaceByChat((previous) => ({ ...previous, [active.id]: focusedPlace === place ? '' : place }))}
                        className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${focusedPlace === place
                          ? 'border-teal-deep bg-teal-deep text-white' : 'border-line bg-white text-ink hover:border-teal'}`}>
                        {place}
                      </button>
                    ))}
                  </div>
                  {!focusedPlace && <p className="m-0 mt-2 text-xs leading-relaxed text-muted">장소를 누르거나 채팅에서 “경복궁에 가고 싶어”처럼 말해보세요.</p>}
                  {focusedPlace && (congestion.status === 'idle' || congestion.place !== focusedPlace) && <p className="m-0 mt-3 text-xs text-muted">{focusedPlace} 혼잡도를 불러오는 중…</p>}
                  {focusedPlace && congestion.status === 'error' && congestion.place === focusedPlace && <p role="alert" className="m-0 mt-3 text-xs text-muted">{congestion.message}</p>}
                  {focusedPlace && congestion.status === 'success' && congestion.place === focusedPlace && (
                    congestion.value.status === 'ok' ? <>
                      <div className="mt-3 text-xs text-ink">{focusedPlace} · <strong className="text-teal-deep">{congestion.value.places[0].level}</strong></div>
                      <p className="m-0 mt-1 text-[length:calc(11px*var(--font-scale))] text-muted">{congestion.value.places[0].observedAt} 기준 · 서울시 실시간 도시데이터</p>
                      <p className="m-0 mt-2 text-[length:calc(11px*var(--font-scale))] text-muted">현재 상태이며 여행 날짜의 예측은 아니에요.</p>
                    </> : <p className="m-0 mt-3 text-xs leading-relaxed text-muted">{congestion.value.status === 'unconfigured' ? '서버 .env에 서울 열린데이터광장 OpenAPI 인증키를 입력해 주세요.' : congestion.value.status === 'invalid_config' ? '서버 .env의 서울시 API 주소를 확인해 주세요.' : congestion.value.status === 'invalid_key' ? '서울시 API가 인증키를 거부했어요. 서울 열린데이터광장의 OpenAPI 인증키를 확인해 주세요.' : '현재 이 장소의 혼잡도 정보가 제공되지 않아요.'}</p>
                  )}
                </>}
              </div>
              <button type="button" onClick={() => navigate('/map')} className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-teal-deep font-semibold cursor-pointer">지도에서 장소 저장하기 →</button>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
