import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import BoardTripControls from '../components/BoardTripControls';
import BoardItinerarySidebar from '../components/BoardItinerarySidebar';
import { CardDateEditor, CardDetailEditor } from '../components/BoardCardEditors';
import BoardConnectionEditor from '../components/BoardConnectionEditor';
import BoardTextElement from '../components/BoardTextElement';
import BoardToolIcon from '../components/BoardToolIcon';
import { connectionText } from '../components/boardConnectionText';
import { connectionNeedsReview, primaryTime } from '../components/boardDisplay';
import { useTrip } from '../context/TripContext';
import type { BoardCard } from '../types';

const CARD_WIDTH = 220;
const cardWidth = (card: BoardCard) => card.kind === 'text' ? card.textWidth ?? 280 : CARD_WIDTH;

function safeReservationUrl(value?: string) {
  if (!value) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : null; }
  catch { return null; }
}

function tripDates(startDate: string | undefined, endDate: string | undefined, scheduledDates: string[]) {
  const dates = new Set(scheduledDates);
  if (startDate) dates.add(startDate);
  if (endDate) dates.add(endDate);
  if (startDate && endDate && startDate <= endDate) {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(end) && (end - start) / 86400000 <= 90) {
      for (let time = start; time <= end; time += 86400000) dates.add(new Date(time).toISOString().slice(0, 10));
    }
  }
  return [...dates].sort();
}

function connectionEndpoints(from: BoardCard, to: BoardCard) {
  const fromWidth = cardWidth(from);
  const toWidth = cardWidth(to);
  if (Math.abs(to.left + toWidth / 2 - from.left - fromWidth / 2) < Math.min(fromWidth, toWidth) / 2) {
    return {
      x1: from.left + fromWidth / 2, y1: from.top + 20,
      x2: to.left + toWidth / 2, y2: to.top + 20,
    };
  }
  const toRight = to.left >= from.left;
  return {
    x1: from.left + (toRight ? fromWidth : 0),
    y1: from.top + 20,
    x2: to.left + (toRight ? 0 : toWidth),
    y2: to.top + 20,
  };
}

// 업로드한 사진을 localStorage에 담을 수 있게 축소 + JPEG 변환
function downscaleImage(file: File, maxSize = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('사진을 변환하지 못했습니다.'));
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BoardPage() {
  const navigate = useNavigate();
  const {
    boardCards: cards,
    moveBoardCard,
    updateBoardCard,
    removeBoardCard,
    addBlankBoardCard,
    connections,
    addConnection,
    updateConnection,
    removeConnection,
    activityLog,
    places,
    savedIds,
    memos,
    addBoardCard,
    savedBoards,
    activeBoardId,
    tripMeta,
    tripPlaces,
    syncStatus,
    areBoardsSynced,
    saveBoard,
    createBoard,
  } = useTrip();

  const activeBoard = savedBoards.find((board) => board.id === activeBoardId);
  const [boardTitle, setBoardTitle] = useState(activeBoard?.title ?? '새 여행 일정');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showPlaces, setShowPlaces] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const savedPlaces = places.filter((place) => savedIds.includes(place.id));
  const hasUnsavedChanges = activeBoard
    ? boardTitle.trim() !== activeBoard.title ||
      JSON.stringify(cards) !== JSON.stringify(activeBoard.cards) ||
      JSON.stringify(connections) !== JSON.stringify(activeBoard.connections) ||
      JSON.stringify(tripMeta) !== JSON.stringify(activeBoard.tripMeta ?? { region: '', partySize: 1, totalBudget: null }) ||
      JSON.stringify(tripPlaces) !== JSON.stringify(activeBoard.tripPlaces ?? tripPlaces)
    : cards.length > 0 || connections.length > 0 || tripPlaces.length > 0 ||
      JSON.stringify(tripMeta) !== JSON.stringify({ region: '', partySize: 1, totalBudget: null });

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [cardPopover, setCardPopover] = useState<{ id: string; kind: 'date' | 'full' | 'cost' } | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileView, setMobileView] = useState<'list' | 'board'>('list');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [shareInfoOpen, setShareInfoOpen] = useState(false);
  const dates = tripDates(tripMeta.startDate, tripMeta.endDate,
    tripPlaces.filter((item) => item.status === 'scheduled' && item.visitDate).map((item) => item.visitDate!));
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0] ?? '';
  const canvasWidth = Math.max(1200, ...cards.map((card) => card.left + cardWidth(card) + 80));
  const canvasHeight = Math.max(780, ...cards.map((card) => card.top + (card.kind === 'text' ? 600 : 270)));

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const visibleSaveMessage = saveMessage === '서버 저장 중...' && syncStatus === 'synced' && areBoardsSynced
    ? '서버에 저장했어요.' : saveMessage;

  const saveCurrentBoard = () => {
    try {
      saveBoard(boardTitle);
      setSaveError('');
      setSaveMessage('서버 저장 중...');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '일정판을 저장하지 못했습니다.');
    }
  };

  const startNewBoard = () => {
    if (hasUnsavedChanges && !window.confirm('새 일정판을 만들까요? 저장하지 않은 변경사항은 사라집니다.')) return;
    createBoard();
    setBoardTitle('새 여행 일정');
    setSaveMessage('');
    setSaveError('');
    setSelectedConnectionId(null);
    setLinkFrom(null);
    setSelectedCardId(null);
    setEditingTextId(null);
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const resizeState = useRef<{ id: string; startX: number; width: number; left: number; side: 'left' | 'right' } | null>(null);
  const connectionDragRef = useRef<{ fromId: string; startClientX: number; startClientY: number; moved: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null); // 교체할 카드 id, null이면 새 카드

  const cardById = (id: string) => cards.find((c) => c.id === id);
  const cardIsOnSelectedDate = (card: BoardCard) => {
    if (!activeDate || !card.placeId) return true;
    const item = tripPlaces.find((place) => place.placeId === card.placeId);
    return !item || item.status === 'scheduled' && item.visitDate === activeDate;
  };

  useEffect(() => () => { if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current); }, []);

  const focusCard = (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    setSelectedCardId(cardId);
    setHighlightedCardId(cardId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedCardId(null), 1800);
    setMobileView('board');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewport = boardViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ left: Math.max(0, card.left - viewport.clientWidth / 2 + cardWidth(card) / 2),
        top: Math.max(0, card.top - viewport.clientHeight / 2 + 100), behavior: 'smooth' });
    }));
  };

  const focusPlace = (placeId: string) => {
    const card = cards.find((item) => item.placeId === placeId);
    if (card) focusCard(card.id);
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    const first = tripPlaces.filter((item) => item.status === 'scheduled' && item.visitDate === date)
      .sort((a, b) => (a.visitOrder ?? 0) - (b.visitOrder ?? 0))[0];
    if (first && (mobileView === 'board' || window.innerWidth >= 1280)) focusPlace(first.placeId);
  };

  // ── 사진 업로드 ──────────────────────────────────────────────
  const openPhotoPicker = (cardId: string | null) => {
    photoTargetRef.current = cardId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError('사진은 JPG·PNG·WebP 형식의 5MB 이하 파일만 사용할 수 있어요.');
      return;
    }
    setUploadError('');
    let dataUrl: string;
    try {
      dataUrl = await downscaleImage(file);
    } catch {
      setUploadError('사진을 읽지 못했습니다. 다른 파일을 선택해주세요.');
      return;
    }
    if (photoTargetRef.current) {
      updateBoardCard(photoTargetRef.current, { imageUrl: dataUrl });
    } else {
      addBlankBoardCard({
        day: '사진',
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '새 사진',
        description: '',
        imageUrl: dataUrl,
      });
    }
  };

  // ── 드래그 이동 ──────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent, id: string, top: number, left: number) => {
    if (linkFrom !== null) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      id,
      offsetX: e.clientX - rect.left - left,
      offsetY: e.clientY - rect.top - top,
    };
    setDraggingId(id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (resizeState.current) {
      const { id, startX, width, left, side } = resizeState.current;
      const delta = e.clientX - startX;
      const nextWidth = Math.max(120, Math.min(side === 'left' ? Math.min(800, left + width) : 800, width + (side === 'right' ? delta : -delta)));
      updateBoardCard(id, side === 'left' ? { textWidth: Math.round(nextWidth), left: Math.round(left + width - nextWidth) } : { textWidth: Math.round(nextWidth) });
      return;
    }
    if (!dragState.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { id, offsetX, offsetY } = dragState.current;
    moveBoardCard(
      id,
      Math.max(0, Math.min(4800, e.clientY - rect.top - offsetY)),
      Math.max(0, Math.min(4800, e.clientX - rect.left - offsetX))
    );
  };

  const handlePointerUp = () => {
    resizeState.current = null;
    dragState.current = null;
    setDraggingId(null);
  };

  const startTextResize = (event: React.PointerEvent<HTMLButtonElement>, card: BoardCard, side: 'left' | 'right') => {
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = { id: card.id, startX: event.clientX, width: cardWidth(card), left: card.left, side };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // ── 카드 가장자리의 연결점을 끌어 다른 카드에 놓는다. ──────────
  const activateConnector = (id: string) => {
    if (linkFrom === null) setLinkFrom(id);
    else if (linkFrom === id) setLinkFrom(null);
    else {
      addConnection(linkFrom, id);
      setLinkFrom(null);
    }
  };

  const cardUnderPointer = (clientX: number, clientY: number) =>
    document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-board-card-id]')?.dataset.boardCardId ?? null;

  const handleConnectorPointerDown = (event: React.PointerEvent<HTMLButtonElement>, fromId: string) => {
    event.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const handleRect = event.currentTarget.getBoundingClientRect();
    const x = handleRect.left + handleRect.width / 2 - canvasRect.left;
    const y = handleRect.top + handleRect.height / 2 - canvasRect.top;
    connectionDragRef.current = { fromId, startClientX: event.clientX, startClientY: event.clientY, moved: false };
    setConnectionPreview({ x1: x, y1: y, x2: x, y2: y });
    setConnectionTargetId(null);
    setSelectedConnectionId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleConnectorPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = connectionDragRef.current;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !canvasRect) return;
    event.stopPropagation();
    if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 5) drag.moved = true;
    setConnectionPreview((previous) => previous && {
      ...previous, x2: event.clientX - canvasRect.left, y2: event.clientY - canvasRect.top,
    });
    const targetId = cardUnderPointer(event.clientX, event.clientY);
    setConnectionTargetId(targetId !== drag.fromId ? targetId : null);
  };

  const handleConnectorPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = connectionDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    const targetId = cardUnderPointer(event.clientX, event.clientY);
    if (targetId && targetId !== drag.fromId) {
      addConnection(drag.fromId, targetId);
      setLinkFrom(null);
    } else if (drag.moved) setLinkFrom(null);
    else activateConnector(drag.fromId);
    connectionDragRef.current = null;
    setConnectionPreview(null);
    setConnectionTargetId(null);
  };

  const handleConnectorPointerCancel = () => {
    connectionDragRef.current = null;
    setConnectionPreview(null);
    setConnectionTargetId(null);
  };

  // 연결점을 한 번 누른 뒤 다른 카드를 클릭해도 연결할 수 있다.
  const handleCardClick = (id: string) => {
    if (linkFrom !== null) activateConnector(id);
    else {
      setSelectedCardId(id);
      setCardPopover((current) => current?.id === id ? current : null);
      const card = cards.find((item) => item.id === id);
      const place = tripPlaces.find((item) => item.placeId === card?.placeId);
      if (place?.status === 'scheduled' && place.visitDate) setSelectedDate(place.visitDate);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (linkFrom || e.target !== canvasRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    addBlankBoardCard({
      top: e.clientY - rect.top - 20,
      left: e.clientX - rect.left - CARD_WIDTH / 2,
    });
  };

  const selectConnection = (id: string) => {
    setSelectedConnectionId(id);
    setCardPopover(null);
    setLinkFrom(null);
  };

  const toggleCardPopover = (id: string, kind: 'date' | 'full' | 'cost') => {
    setCardPopover((current) => current?.id === id && current.kind === kind ? null : { id, kind });
    setSelectedCardId(id);
    setSelectedConnectionId(null);
  };

  const toolBtn =
    'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 text-xs text-teal-deep cursor-pointer hover:bg-paper transition-colors';

  return (
    <>
      <Topbar title="여행 동선 · 일정판" stamp={linkFrom ? '연결할 카드 선택' : '드래그 앤 편집 모드'} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className={isExpanded
        ? 'fixed inset-0 z-[1000] overflow-y-auto bg-paper p-4 md:p-6 print:static print:p-0'
        : 'flex-1 overflow-y-auto p-4 md:p-8'}>
        {isExpanded && <h1 className="m-0 mb-4 font-display text-xl font-bold text-ink print:hidden">여행 동선 · 일정판</h1>}
        <div className="flex flex-wrap items-center gap-2 mb-2 print:hidden">
          <input
            aria-label="일정판 이름"
            value={boardTitle}
            maxLength={80}
            onChange={(event) => { setBoardTitle(event.target.value); setSaveMessage(''); setSaveError(''); }}
            className="min-w-[180px] flex-1 max-w-[360px] rounded-xl border border-line bg-white px-3 py-2 font-display text-[15px] font-semibold text-ink outline-teal"
          />
          <button type="button" onClick={saveCurrentBoard} disabled={!boardTitle.trim()}
            className="rounded-xl bg-teal-deep text-white px-3 py-2 text-xs font-semibold cursor-pointer border-none disabled:opacity-50">
            기록함에 저장
          </button>
          <button type="button" onClick={startNewBoard} className="rounded-xl border border-line bg-white text-teal-deep px-3 py-2 text-xs cursor-pointer">새 일정판</button>
          <button type="button" onClick={() => navigate('/diary')} className="rounded-xl border border-line bg-white text-teal-deep px-3 py-2 text-xs cursor-pointer">기록함</button>
          <button type="button" onClick={() => setShareInfoOpen(true)} className="rounded-xl border border-line bg-white text-teal-deep px-3 py-2 text-xs cursor-pointer">공유</button>
          <span role="status" className="text-xs text-teal-deep">
            {syncStatus === 'error' ? '서버 저장 실패' : hasUnsavedChanges ? '저장되지 않은 변경사항' : visibleSaveMessage || (activeBoard ? '저장된 일정판' : '새 일정판')}
          </span>
          {saveError && <span role="alert" className="text-xs text-pin">{saveError}</span>}
          {uploadError && <span role="alert" className="text-xs text-pin">{uploadError}</span>}
        </div>
        <BoardTripControls />
        <div className="flex justify-between items-center mb-2 gap-2 flex-wrap print:hidden">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setShowPlaces((value) => !value)}
              className={toolBtn}
            >
              <BoardToolIcon name="place" />장소 불러오기
            </button>
            <button
              onClick={() =>
                addBlankBoardCard({ day: '메모', title: '새 메모', description: '' })
              }
              className={toolBtn}
            >
              <BoardToolIcon name="memo" />메모 추가
            </button>
            <button type="button" onClick={() => {
              const id = addBlankBoardCard({ kind: 'text', day: '텍스트', title: '텍스트', description: '', textWidth: 280, textFontSize: 28, textBold: true });
              setSelectedCardId(id);
              setEditingTextId(id);
              setMobileView('board');
            }}
              className={toolBtn}>
              <BoardToolIcon name="text" />텍스트 추가
            </button>
            <button type="button" onClick={() => openPhotoPicker(null)} className={toolBtn}>
              <BoardToolIcon name="photo" />사진 추가
            </button>
            <button
              onClick={() => setShowPanel((v) => !v)}
              className={`${toolBtn} ${showPanel ? 'bg-paper' : ''}`}
            >
              <BoardToolIcon name="list" />{showPanel ? '목록 닫기' : '카드 목록'}
            </button>
            <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-pressed={isExpanded}
              className={toolBtn}>
              <BoardToolIcon name="expand" />{isExpanded ? '기본 화면' : '화면 크게'}
            </button>
          </div>
          {/* PDF 저장: 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택 */}
          <button type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border-none bg-teal-deep px-2.5 text-xs text-white cursor-pointer"
          >
            <BoardToolIcon name="pdf" />PDF 저장
          </button>
        </div>

        {showPlaces && (
          <div className="mb-4 rounded-2xl border border-line bg-white p-4 print:hidden">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="m-0 text-sm font-semibold text-teal-deep">지도에 저장한 장소</h2>
              <button type="button" onClick={() => navigate('/map')} className="text-xs text-teal bg-transparent border-none cursor-pointer">지도에서 장소 찾기 →</button>
            </div>
            {savedPlaces.length ? (
              <div className="flex flex-wrap gap-2">
                {savedPlaces.map((place) => {
                  const added = cards.some((card) => card.placeId === place.id);
                  return (
                    <button key={place.id} type="button" disabled={added}
                      onClick={() => addBoardCard({
                        day: '저장한 장소', title: place.name,
                        description: memos[place.id] || '',
                        address: place.address, placeId: place.id,
                      })}
                      className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-soft cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      <span className="block font-semibold">{place.name} {added ? '· 추가됨' : '· 카드로 추가'}</span>
                      {place.address && <span className="block mt-1 text-muted">{place.address}</span>}
                    </button>
                  );
                })}
              </div>
            ) : <p className="m-0 text-xs text-muted">아직 저장한 장소가 없어요. 지도에서 장소를 저장해 주세요.</p>}
          </div>
        )}

        <p className="text-[11px] text-[#8B8272] mb-1 print:hidden">
          {linkFrom
            ? '연결할 카드를 클릭하세요. 빈 공간을 클릭하면 취소됩니다.'
            : '카드를 배치하고 연결점을 끌어 동선을 만드세요. 날짜·비용·이동 정보는 필요한 카드와 선에서 편집할 수 있어요.'}
        </p>

        <div className="mb-2 flex items-center gap-2 print:hidden">
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-expanded={sidebarOpen}
            className="hidden xl:inline-flex rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-teal-deep cursor-pointer">{sidebarOpen ? '일정 접기' : '일정 펼치기'}</button>
          <button type="button" onClick={() => setMobileView((view) => view === 'list' ? 'board' : 'list')}
            className="xl:hidden rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs text-teal-deep cursor-pointer">{mobileView === 'list' ? '화이트보드 보기' : '날짜별 목록 보기'}</button>
        </div>
        <div className="flex flex-col xl:flex-row gap-3">
          {sidebarOpen && <div className={mobileView === 'board' ? 'hidden xl:block' : 'block'}>
            <BoardItinerarySidebar dates={dates} selectedDate={activeDate} onSelectDate={selectDate}
              onFocusCard={focusPlace} onAddPlace={() => { setShowPlaces(true); setMobileView('board'); }} editable
              mobileBoardButton={() => setMobileView('board')} />
          </div>}
          {/* 캔버스 */}
          <div ref={boardViewportRef} className={`min-w-0 flex-1 bg-white border border-line rounded-2xl overflow-auto print:h-auto print:overflow-visible print:border-0 ${mobileView === 'list' ? 'hidden xl:block' : 'block'} ${
            isExpanded ? 'h-[calc(100dvh-180px)] min-h-[500px]' : 'h-[calc(100dvh-190px)] min-h-[480px]'
          }`}>
            <div
              id="board-canvas"
              ref={canvasRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleCanvasDoubleClick}
              onClick={(event) => { if (event.target === canvasRef.current) { setSelectedConnectionId(null); setSelectedCardId(null); setEditingTextId(null); setCardPopover(null); setLinkFrom(null); } }}
              className="relative min-w-full min-h-full"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            >
              <svg
                className="absolute top-0 left-0 w-full h-full z-[1]"
                style={{ pointerEvents: 'none' }}
              >
                <defs>
                  <marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2F6F6B" /></marker>
                  <marker id="route-arrow-review" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#B76A36" /></marker>
                </defs>
                {connections.map((cn) => {
                  const a = cardById(cn.from);
                  const b = cardById(cn.to);
                  if (!a || !b) return null;
                  const { x1, y1, x2, y2 } = connectionEndpoints(a, b);
                  const emphasized = cardIsOnSelectedDate(a) && cardIsOnSelectedDate(b);
                  const needsReview = connectionNeedsReview(cn, cards, tripPlaces);
                  return (
                    <g
                      key={cn.id}
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onClick={(event) => { event.stopPropagation(); selectConnection(cn.id); }}
                    >
                      {/* 얇은 선도 쉽게 선택할 수 있도록 넓은 클릭 영역을 둔다. */}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={22} pointerEvents="stroke" />
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={needsReview ? '#B76A36' : selectedConnectionId === cn.id ? '#D64545' : '#2F6F6B'}
                        opacity={emphasized ? 1 : 0.25}
                        strokeWidth={2}
                        strokeDasharray="6 5"
                        markerEnd={needsReview ? 'url(#route-arrow-review)' : 'url(#route-arrow)'}
                      />
                    </g>
                  );
                })}
                {connectionPreview && (
                  <line x1={connectionPreview.x1} y1={connectionPreview.y1}
                    x2={connectionPreview.x2} y2={connectionPreview.y2}
                    stroke="#D64545" strokeWidth={2.5} strokeDasharray="7 5" />
                )}
              </svg>

              {connections.map((connection) => {
                const from = cardById(connection.from);
                const to = cardById(connection.to);
                if (!from || !to) return null;
                const { x1, y1, x2, y2 } = connectionEndpoints(from, to);
                const midpointX = (x1 + x2) / 2;
                const midpointY = (y1 + y2) / 2;
                const selected = selectedConnectionId === connection.id;
                const emphasized = cardIsOnSelectedDate(from) && cardIsOnSelectedDate(to);
                const needsReview = connectionNeedsReview(connection, cards, tripPlaces);
                return (
                  <div key={connection.id}>
                    <button type="button" onClick={(event) => { event.stopPropagation(); selectConnection(connection.id); }}
                      aria-label={`${from.title}에서 ${to.title}까지 이동 정보 수정${needsReview ? ', 방문 순서 재확인 필요' : ''}`}
                      className={`absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-white px-2.5 py-1 text-[11px] font-semibold shadow-sm cursor-pointer ${needsReview ? 'border-[#B76A36] text-[#91532B]' : selected ? 'border-pin text-pin' : 'border-teal text-teal-deep'}`}
                      style={{ left: midpointX, top: midpointY, opacity: emphasized ? 1 : 0.45 }}>
                      {connectionText(connection, '이동 정보 추가')}{needsReview && ' · 순서 재확인'}
                    </button>
                    {selected && (
                      <div className="absolute z-30" style={{ left: Math.max(120, Math.min(canvasWidth - 120, midpointX)), top: midpointY + 28 }}>
                        <BoardConnectionEditor key={connection.id} connection={connection} needsReview={needsReview}
                          onSave={(patch) => updateConnection(connection.id, patch)}
                          onDelete={() => { removeConnection(connection.id); setSelectedConnectionId(null); }}
                          onClose={() => setSelectedConnectionId(null)} />
                      </div>
                    )}
                  </div>
                );
              })}

              {cards.map((card) => {
                const isLinkSource = linkFrom === card.id;
                const isConnectionTarget = connectionTargetId === card.id;
                const tripPlace = tripPlaces.find((item) => item.placeId === card.placeId);
                const reservationUrl = safeReservationUrl(tripPlace?.reservationUrl);
                const dayItems = tripPlace?.visitDate ? tripPlaces.filter((item) => item.status === 'scheduled' && item.visitDate === tripPlace.visitDate)
                  .sort((a, b) => (a.visitOrder ?? 0) - (b.visitOrder ?? 0)) : [];
                const orderNumber = tripPlace ? dayItems.findIndex((item) => item.id === tripPlace.id) + 1 : 0;
                const cardDateLabel = tripPlace?.status === 'scheduled' && tripPlace.visitDate
                  ? `${tripPlace.visitDate === activeDate ? '' : `${tripPlace.visitDate} · `}${orderNumber}번`
                  : card.day.startsWith('DAY') ? card.day : '';
                const cardTime = tripPlace ? primaryTime(tripPlace, card) : card.time ? `방문 예정 ${card.time}` : '';
                const isSelected = selectedCardId === card.id;
                const isEmphasized = cardIsOnSelectedDate(card);
                return (
                  <div
                    key={card.id}
                    data-board-card-id={card.id}
                    tabIndex={0}
                    role="group"
                    aria-label={card.kind === 'text' ? `텍스트: ${card.description || '빈 텍스트'}` : `${card.title} 카드`}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); handleCardClick(card.id); } }}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button,input,textarea,select,a,[data-no-drag]')) return;
                      if (card.kind === 'text') setSelectedCardId(card.id);
                      handlePointerDown(e, card.id, card.top, card.left);
                    }}
                    onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,textarea,select,a,[data-no-drag]')) handleCardClick(card.id); }}
                    className={`board-card group absolute border select-none transition-shadow ${card.kind === 'text' ? 'rounded-none bg-transparent shadow-none' : 'rounded-xl bg-white'} ${
                      draggingId === card.id
                        ? 'shadow-2xl cursor-grabbing z-30'
                        : isSelected ? 'cursor-move z-20' : linkFrom ? 'cursor-pointer z-[2]' : 'cursor-move z-[2]'
                    } ${card.kind === 'text' ? isSelected ? 'border-[#4B8CF6] print:border-transparent' : 'border-transparent' : isLinkSource || isConnectionTarget ? 'border-pin ring-2 ring-pin' : highlightedCardId === card.id ? 'border-teal-deep ring-[3px] ring-teal-deep' : isSelected ? 'border-teal ring-2 ring-teal/40' : 'border-line'}`}
                    style={{ top: card.top, left: card.left, width: cardWidth(card), opacity: isEmphasized ? 1 : 0.48 }}
                  >
                    {card.kind !== 'text' && (['left', 'right'] as const).map((side) => (
                      <button key={side} type="button"
                        aria-label={`${card.title}에서 다른 카드로 선 연결`}
                        title="다른 카드로 끌어 선 연결"
                        onPointerDown={(event) => handleConnectorPointerDown(event, card.id)}
                        onPointerMove={handleConnectorPointerMove}
                        onPointerUp={handleConnectorPointerUp}
                        onPointerCancel={handleConnectorPointerCancel}
                        onClick={(event) => { event.stopPropagation(); if (event.detail === 0) activateConnector(card.id); }}
                        className={`board-connector absolute top-[11px] z-40 h-[18px] w-[18px] rounded-full border-2 border-teal bg-white shadow-sm cursor-crosshair touch-none hover:bg-teal ${side === 'left' ? '-left-[9px]' : '-right-[9px]'}`}
                      />
                    ))}
                    {card.kind !== 'text' && <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBoardCard(card.id);
                        if (cardPopover?.id === card.id) setCardPopover(null);
                        if (selectedCardId === card.id) setSelectedCardId(null);
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-line text-[#B7AE97] text-[11px] leading-none shadow-sm hover:text-white hover:bg-pin hover:border-pin transition-colors cursor-pointer"
                      aria-label="카드 삭제"
                    >
                      ✕
                    </button>}

                    {card.kind === 'text' ? <BoardTextElement card={card} selected={isSelected} editing={editingTextId === card.id}
                      onChange={(patch) => updateBoardCard(card.id, patch)} onEdit={() => setEditingTextId(card.id)} onFinish={() => setEditingTextId(null)}
                      onDuplicate={() => {
                        const id = addBlankBoardCard({ kind: 'text', day: '텍스트', title: '텍스트', description: card.description,
                          textWidth: card.textWidth ?? 280, textFontSize: card.textFontSize ?? 28, textBold: card.textBold ?? true,
                          textAlign: card.textAlign ?? 'left', top: card.top + 32, left: card.left + 32 });
                        setSelectedCardId(id);
                        setEditingTextId(null);
                      }}
                      onDelete={() => { removeBoardCard(card.id); setSelectedCardId(null); setEditingTextId(null); }}
                      onResizeStart={(event, side) => startTextResize(event, card, side)} /> : <>
                    <div className="px-3 pt-3 pb-2 flex items-center gap-2">
                      <h5 onDoubleClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                        className="m-0 min-w-0 flex-1 truncate text-sm leading-tight text-teal-deep">{card.title}</h5>
                      {isSelected && <button type="button" onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                        className="shrink-0 border-none bg-transparent text-xs text-teal cursor-pointer" aria-label={`${card.title} 수정`}>수정</button>}
                    </div>

                    {tripPlace && <div className="relative px-3 -mt-1 mb-2 flex flex-wrap items-center gap-1.5">
                      {tripPlace.status !== 'scheduled' && <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] text-teal-deep">{tripPlace.status === 'unassigned' ? '미분류' : '후보'}</span>}
                      <button type="button" onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'date'); }}
                        className="border-none bg-transparent p-0 text-[11px] font-semibold text-teal-deep cursor-pointer">
                        {cardDateLabel ? `${cardDateLabel}${cardTime ? ` · ${cardTime}` : ''}` : tripPlace.status === 'scheduled' ? '방문 날짜 수정' : '일정에 추가'}
                      </button>
                      {cardPopover?.id === card.id && cardPopover.kind === 'date' && <CardDateEditor key={`date-${card.id}`} item={tripPlace} card={card} onClose={() => setCardPopover(null)} />}
                    </div>}
                    {!tripPlace && (card.day.startsWith('DAY') || card.time) && <div className="px-3 -mt-1 mb-2 text-[11px] text-teal-deep font-mono">{[card.day.startsWith('DAY') ? card.day : '', card.time ? `방문 예정 ${card.time}` : ''].filter(Boolean).join(' · ')}</div>}

                    {card.address && <p className="px-3 my-1 truncate text-[11px] text-muted" title={card.address}>{card.address}</p>}

                    {card.imageUrl && <div className="h-[90px] bg-sand bg-cover bg-center" style={{ backgroundImage: `url('${card.imageUrl}')` }} />}

                    {card.description && <p onDoubleClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                      className="px-3 py-2 m-0 text-xs leading-relaxed text-[#8B8272] line-clamp-3">{card.description}</p>}
                    {tripPlace?.note && tripPlace.note !== card.description && <p className="px-3 py-1 m-0 text-xs text-[#8B8272] line-clamp-2">{tripPlace.note}</p>}

                    {tripPlace?.cost !== null && tripPlace?.cost !== undefined && <div className="mx-3 mb-1 text-[11px] text-ink-soft">
                      예상 비용 · {tripPlace.costBasis === 'per_person' ? '1인' : '일행 전체'} <span className="font-mono tabular-nums">{tripPlace.cost.toLocaleString('ko-KR')}원</span>
                    </div>}
                    {reservationUrl && <a href={reservationUrl} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="mx-3 mb-2 inline-block text-[11px] text-teal-deep underline">예약 확인</a>}
                    {isSelected && <div className="mx-3 mb-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px]">
                      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }} className="border-none bg-transparent p-0 text-teal cursor-pointer">{card.description ? '메모 수정' : '+ 메모'}</button>
                      {!card.imageUrl && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openPhotoPicker(card.id); }} className="border-none bg-transparent p-0 text-teal cursor-pointer">+ 사진</button>}
                      {tripPlace && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'cost'); }} className="border-none bg-transparent p-0 text-teal cursor-pointer">{tripPlace.cost === null || tripPlace.cost === undefined ? '+ 비용' : '비용 수정'}</button>}
                      {card.placeId && places.some((place) => place.id === card.placeId) && <button type="button" onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); navigate(`/map?placeId=${encodeURIComponent(card.placeId!)}`); }} className="border-none bg-transparent p-0 text-teal cursor-pointer">지도 보기</button>}
                    </div>}
                    </>}
                  </div>
                );
              })}
            </div>
          </div>

          {cardPopover && cardPopover.kind !== 'date' && cardById(cardPopover.id) && <>
            <button type="button" aria-label="카드 편집 닫기" onClick={() => setCardPopover(null)}
              className="fixed inset-0 z-[1999] border-none bg-black/30 xl:hidden print:hidden" />
            <CardDetailEditor key={`${cardPopover.kind}-${cardPopover.id}`} card={cardById(cardPopover.id)!}
              item={tripPlaces.find((item) => item.placeId === cardById(cardPopover.id)?.placeId)} mode={cardPopover.kind}
              onClose={() => setCardPopover(null)} onChoosePhoto={() => openPhotoPicker(cardPopover.id)}
              onRemovePhoto={() => updateBoardCard(cardPopover.id, { imageUrl: undefined })} />
          </>}

          {showPanel && !cardPopover && (
            <aside className="w-full xl:w-[260px] shrink-0 flex flex-col gap-4 print:hidden">
              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <h4 className="m-0 mb-3 text-[13px] font-display font-semibold text-teal-deep">카드 목록 ({cards.length})</h4>
                {cards.length ? (
                  <div className="flex flex-col gap-2">
                    {cards.map((card) => (
                      <div key={card.id} className="flex items-center gap-2 text-xs text-ink-soft">
                        <span className="text-[10px] text-muted">{card.placeId ? '장소' : card.imageUrl ? '사진' : card.kind === 'text' ? '텍스트' : '메모'}</span>
                        <span className="truncate flex-1">{card.kind === 'text' ? card.description || '빈 텍스트' : card.title}</span>
                        <button type="button" onClick={() => removeBoardCard(card.id)} aria-label="카드 삭제"
                          className="text-pin bg-transparent border-none cursor-pointer">✕</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="m-0 text-xs text-muted">장소·메모·사진 카드를 추가해 보세요.</p>}
              </div>
              {activityLog.length > 0 && (
                <div className="bg-white border border-line rounded-2xl px-4 py-4">
                  <h4 className="m-0 mb-2 text-xs font-semibold text-muted">이번 편집의 변경사항</h4>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1">
                    {activityLog.map((item, index) => <li key={index} className="text-xs text-ink-soft">• {item}</li>)}
                  </ul>
                </div>
              )}
              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <h4 className="m-0 mb-2 text-xs font-semibold text-teal-deep">친구와 공동 편집</h4>
                <p className="m-0 text-xs leading-relaxed text-muted">일정판은 로그인 계정의 서버에 저장됩니다. 친구와 함께 수정하는 공유 링크·참여자 권한은 아직 연결되지 않았습니다.</p>
              </div>
            </aside>
          )}
        </div>
      </div>

      {shareInfoOpen && <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={() => setShareInfoOpen(false)}>
        <div role="dialog" aria-modal="true" aria-label="공유 안내" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <h2 className="m-0 text-base font-semibold text-teal-deep">일정판 공유</h2>
          <p className="my-3 text-sm text-ink-soft">공유 링크와 참여자 권한은 아직 연결되지 않았습니다. 현재 로그인한 계정에서만 이 일정판을 열고 수정할 수 있어요.</p>
          <button type="button" onClick={() => setShareInfoOpen(false)} className="rounded-lg border-none bg-teal-deep px-3 py-2 text-xs text-white cursor-pointer">확인</button>
        </div>
      </div>}

    </>
  );
}
