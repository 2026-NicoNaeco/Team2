import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import BoardTripControls from '../components/BoardTripControls';
import BoardItinerarySidebar from '../components/BoardItinerarySidebar';
import { CardDateEditor, CardDetailEditor } from '../components/BoardCardEditors';
import BoardConnectionEditor from '../components/BoardConnectionEditor';
import BoardTextElement from '../components/BoardTextElement';
import BoardToolIcon from '../components/BoardToolIcon';
import BoardShareDialog from '../components/BoardShareDialog';
import { connectionText } from '../components/boardConnectionText';
import { connectionNeedsReview, placeTimes, primaryTime } from '../components/boardDisplay';
import { PIN_COLOR } from '../components/mapPinColors';
import { useTrip } from '../context/TripContext';
import { useAuth } from '../context/AuthContext';
import { BoardApiError, createBoard as createApiBoard, getBoard, updateBoard as updateApiBoard } from '../services/boards';
import type { BoardApiBoard, BoardApiData, BoardCard } from '../types';

const CARD_WIDTH = 220;
const cardWidth = (card: BoardCard) => card.kind === 'text' ? card.textWidth ?? 280 : CARD_WIDTH;

function sameBoardValue(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonical(nested)]));
    }
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

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
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useAuth();
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
    createBoard,
    apiWorkspaceBoardId,
    loadApiBoard,
    adoptCreatedBoard,
    restoreBoardDraft,
  } = useTrip();

  const activeLegacyBoard = savedBoards.find((board) => board.id === activeBoardId);
  const draftTitleKey = `tteonayo:board-draft-title:${user?.id ?? 'unknown'}`;
  const [boardTitle, setBoardTitle] = useState(() => activeLegacyBoard?.title ?? localStorage.getItem(draftTitleKey) ?? '새 여행 일정');
  const [apiBoard, setApiBoard] = useState<BoardApiBoard | null>(null);
  const [boardLoadError, setBoardLoadError] = useState<BoardApiError | null>(null);
  const [boardLoadAttempt, setBoardLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showPlaces, setShowPlaces] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const savedPlaces = places.filter((place) => savedIds.includes(place.id));
  const hasUnsavedChanges = boardId && apiBoard?.id === boardId
    ? boardTitle.trim() !== apiBoard.title ||
      !sameBoardValue(cards, apiBoard.data.cards) ||
      !sameBoardValue(connections, apiBoard.data.connections) ||
      !sameBoardValue(tripMeta, apiBoard.data.tripMeta ?? { region: '', partySize: 1, totalBudget: null }) ||
      !sameBoardValue(tripPlaces, apiBoard.data.tripPlaces ?? [])
    : cards.length > 0 || connections.length > 0 || tripPlaces.length > 0 ||
      JSON.stringify(tripMeta) !== JSON.stringify({ region: '', partySize: 1, totalBudget: null });

  useEffect(() => {
    if (!boardId) {
      setApiBoard(null);
      setBoardLoadError(null);
      if (apiWorkspaceBoardId) restoreBoardDraft();
      setBoardTitle(localStorage.getItem(draftTitleKey) ?? (apiWorkspaceBoardId ? '새 여행 일정' : activeLegacyBoard?.title) ?? '새 여행 일정');
      return;
    }
    let cancelled = false;
    setBoardLoadError(null);
    void getBoard(boardId).then((board) => {
      if (cancelled) return;
      loadApiBoard(board);
      setApiBoard(board);
      setBoardTitle(board.title);
      setSaveError('');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setBoardLoadError(error instanceof BoardApiError ? error : new BoardApiError(0, '일정판을 불러오지 못했어요.'));
    });
    return () => { cancelled = true; };
    // The API load is keyed by route and explicit retry, not by workspace edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, boardLoadAttempt]);

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

  const saveCurrentBoard = async () => {
    if (savingRef.current || (boardId && apiBoard?.id !== boardId)) return;
    if (!boardId && activeLegacyBoard) {
      setSaveError('이전 형식 일정판은 읽기 전용으로 보관 중이에요. 기록함에서 데이터 이전 안내를 확인해 주세요.');
      return;
    }
    const title = boardTitle.trim();
    if (!title || title.length > 80) {
      setSaveError('일정판 이름은 1~80자로 입력해주세요.');
      return;
    }
    const data: BoardApiData = { schemaVersion: 1, cards, connections, tripMeta, tripPlaces };
    savingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    setSaveMessage('서버 저장 중...');
    try {
      if (boardId && apiBoard) {
        const saved = await updateApiBoard(boardId, apiBoard.version, title, data);
        setApiBoard(saved);
      } else {
        const saved = await createApiBoard(title, data);
        adoptCreatedBoard(saved.id);
        setApiBoard(saved);
        try { localStorage.removeItem(draftTitleKey); } catch { /* Server save succeeded. */ }
        navigate(`/board/${saved.id}`, { replace: true });
      }
      setSaveMessage('서버에 저장했어요.');
    } catch (error: unknown) {
      const message = error instanceof BoardApiError && error.status === 409
        ? '다른 곳에서 수정되었습니다. 새로고침하세요. 현재 편집 내용은 화면에 남아 있어요.'
        : error instanceof BoardApiError && error.status === 413
          ? '사진을 포함한 일정판이 8MB를 초과했어요. 사진을 줄인 뒤 다시 저장해 주세요. 현재 편집 내용은 화면에 남아 있어요.'
          : error instanceof Error ? error.message : '일정판을 저장하지 못했습니다.';
      setSaveError(message);
      setSaveMessage('');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const startNewBoard = () => {
    if (hasUnsavedChanges && !window.confirm('새 일정판을 만들까요? 저장하지 않은 변경사항은 사라집니다.')) return;
    createBoard();
    navigate('/board');
    setBoardTitle('새 여행 일정');
    try { localStorage.removeItem(draftTitleKey); } catch { /* Keep the editor usable. */ }
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

  const toolBtnBase =
    'h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 text-xs text-teal-deep cursor-pointer hover:bg-paper transition-colors';
  const toolBtn = `inline-flex ${toolBtnBase}`;

  if (boardId && boardLoadError) {
    return <>
      <Topbar title="여행 동선 · 일정판" stamp="" />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert" className="m-0 text-sm text-ink">{boardLoadError.status === 404 ? '일정판을 찾을 수 없어요.' : boardLoadError.message}</p>
        <div className="flex gap-2">
          {boardLoadError.status !== 404 && <button type="button" onClick={() => setBoardLoadAttempt((count) => count + 1)}
            className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-teal-deep cursor-pointer">다시 시도</button>}
          <button type="button" onClick={() => navigate('/home')}
            className="rounded-xl border-none bg-teal-deep px-4 py-2 text-sm text-white cursor-pointer">홈으로 이동</button>
        </div>
      </div>
    </>;
  }
  if (boardId && apiBoard?.id !== boardId) {
    return <>
      <Topbar title="여행 동선 · 일정판" stamp="" />
      <div role="status" className="flex-1 flex items-center justify-center text-sm text-muted">일정판을 불러오는 중입니다.</div>
    </>;
  }

  return (
    <>
      <Topbar title="여행 동선 · 일정판" stamp={linkFrom ? '연결할 카드를 누르세요' : ''} />
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
        <section className="mb-3 w-full min-w-0 max-w-[1600px] print:hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <input
              aria-label="일정판 이름"
              title="눌러서 이름 수정"
              value={boardTitle}
              maxLength={80}
              onChange={(event) => {
                setBoardTitle(event.target.value);
                if (!boardId) {
                  try { localStorage.setItem(draftTitleKey, event.target.value); } catch { /* Server draft backup remains. */ }
                }
                setSaveMessage(''); setSaveError('');
              }}
              className="-ml-2 box-border min-w-0 flex-[1_1_280px] rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-xl font-bold text-ink outline-none hover:border-line hover:bg-white focus:border-teal focus:bg-white md:text-2xl"
            />
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted">
                {hasUnsavedChanges && !isSaving && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#C77D30]" />}
                {isSaving ? '서버 저장 중...' : hasUnsavedChanges ? '저장되지 않은 변경사항' : saveMessage || (apiBoard ? '저장된 일정판' : '새 일정판')}
              </span>
              <button type="button" onClick={startNewBoard} className="rounded-lg border-none bg-transparent px-2 py-2 text-sm text-ink-soft cursor-pointer hover:bg-white">새 일정판</button>
              <button type="button" onClick={() => navigate('/diary')} className="rounded-lg border-none bg-transparent px-2 py-2 text-sm text-ink-soft cursor-pointer hover:bg-white">기록함</button>
              <button type="button" onClick={() => setShareInfoOpen(true)}
                className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-teal-deep cursor-pointer hover:bg-paper">공유</button>
              <button type="button" onClick={() => { void saveCurrentBoard(); }} disabled={!boardTitle.trim() || isSaving || apiBoard?.role === 'viewer' || (!boardId && Boolean(activeLegacyBoard))}
                className="rounded-xl border-none bg-teal-deep px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-teal disabled:opacity-50">
                일정판 저장
              </button>
            </div>
          </div>
          {(saveError || uploadError) && <div className="mt-2 flex flex-wrap gap-2">
            {saveError && <span role="alert" className="text-xs text-pin">{saveError}</span>}
            {uploadError && <span role="alert" className="text-xs text-pin">{uploadError}</span>}
          </div>}
        </section>
        {!boardId && activeLegacyBoard && <div role="status"
          className="mb-3 flex w-full min-w-0 max-w-[1600px] flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8CCAA] bg-[#FFF4E8] px-3 py-1.5 text-xs text-[#805B35] print:hidden">
          <span>이전 형식 일정판은 보관 중이에요. 새 보드로 저장할 수 없습니다.</span>
          <button type="button" onClick={() => navigate('/diary')}
            className="shrink-0 rounded-md border border-[#D9B98F] bg-white px-2.5 py-1 text-xs font-semibold text-[#805B35] cursor-pointer">기록함 보기</button>
        </div>}
        <BoardTripControls />
        <div className="mb-2 flex w-full min-w-0 max-w-[1600px] flex-wrap items-center justify-between gap-x-5 gap-y-2 print:hidden">
          <div className="flex min-w-0 flex-wrap gap-2">
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
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setSidebarOpen((value) => !value)} aria-expanded={sidebarOpen}
              className={`${toolBtnBase} hidden xl:inline-flex`}>{sidebarOpen ? '일정 접기' : '일정 펼치기'}</button>
            <button type="button" onClick={() => setMobileView((view) => view === 'list' ? 'board' : 'list')}
              className={`${toolBtnBase} inline-flex xl:hidden`}>{mobileView === 'list' ? '화이트보드 보기' : '날짜별 목록 보기'}</button>
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
            {/* PDF 저장: 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택 */}
            <button type="button"
              onClick={() => window.print()}
              className={toolBtn}
            >
              <BoardToolIcon name="pdf" />PDF 저장
            </button>
          </div>
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
            {(linkFrom || cards.length === 0) && <div className="pointer-events-none sticky left-0 top-0 z-40 h-0 print:hidden">
              <p className={`absolute left-3 top-3 m-0 rounded-full px-3 py-1.5 text-xs shadow-sm ${linkFrom ? 'bg-pin text-white' : 'bg-paper text-ink-soft'}`}>
                {linkFrom ? '연결할 카드를 누르세요. 빈 곳을 누르면 취소돼요.' : '장소 불러오기로 카드를 꺼내고, 카드 옆 점을 끌어 동선을 이어 보세요.'}
              </p>
            </div>}
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
                      className={`absolute z-20 max-w-[220px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border bg-white px-2.5 py-1 text-[length:calc(11px*var(--font-scale))] font-semibold shadow-sm cursor-pointer ${needsReview ? 'border-[#B76A36] text-[#91532B]' : selected ? 'border-pin text-pin' : 'border-teal text-teal-deep'}`}
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
                // 카드에는 번호 배지와 함께 날짜(선택한 날이 아닐 때)·방문/예약 시간을 모두 보여준다.
                const times = tripPlace ? placeTimes(tripPlace, card) : null;
                const scheduleText = tripPlace?.status === 'scheduled' && tripPlace.visitDate ? [
                  tripPlace.visitDate === activeDate ? '' : `${tripPlace.visitDate.slice(5, 7)}/${tripPlace.visitDate.slice(8, 10)}`,
                  times?.visitTime ? `방문 ${times.visitTime}` : '',
                  times?.reservationTime ? `예약 ${times.reservationTime}` : '',
                ].filter(Boolean).join(' · ') : '';
                const linkedPlace = card.placeId ? places.find((item) => item.id === card.placeId) : undefined;
                // 장소 카드는 지도 분류 색, 메모 카드는 모래색 띠로 구분한다. 사진 카드는 사진이 구분 역할을 한다.
                const accent = linkedPlace ? PIN_COLOR[linkedPlace.category] : card.placeId || card.imageUrl ? null : '#D8CDB2';
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
                    className={`board-card group absolute border select-none transition-shadow ${isSelected ? 'is-selected' : ''} ${card.kind === 'text' ? 'rounded-none bg-transparent shadow-none' : 'rounded-xl bg-white shadow-[0_1px_3px_rgba(34,48,60,0.08)] hover:shadow-md'} ${
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
                      className="board-card-delete absolute -top-2 -right-2 z-40 w-6 h-6 rounded-full bg-white border border-line text-muted text-[length:calc(11px*var(--font-scale))] leading-none shadow-sm hover:text-white hover:bg-pin hover:border-pin transition-colors cursor-pointer"
                      aria-label={`${card.title} 카드 삭제`}
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
                    {accent && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-xl" style={{ background: accent }} />}
                    <div className="flex items-start gap-2 px-3 pt-3 pb-1.5">
                      {tripPlace?.status === 'scheduled' && orderNumber > 0
                        ? <span title={`${orderNumber}번째 방문`} className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-deep text-xs font-bold text-white">{orderNumber}</span>
                        : <span className="mt-0.5 shrink-0 text-muted"><BoardToolIcon name={card.placeId ? 'place' : card.imageUrl ? 'photo' : 'memo'} /></span>}
                      <h5 onDoubleClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                        title={card.title}
                        className="m-0 min-w-0 flex-1 break-words text-[length:calc(15px*var(--font-scale))] font-semibold leading-snug text-ink line-clamp-2">{card.title}</h5>
                      {isSelected && <button type="button" onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                        className="mt-0.5 shrink-0 border-none bg-transparent text-xs text-teal cursor-pointer" aria-label={`${card.title} 수정`}>수정</button>}
                    </div>

                    {tripPlace && <div className="relative mb-1.5 flex flex-wrap items-center gap-1.5 px-3">
                      {tripPlace.status !== 'scheduled' && <span className="rounded bg-paper px-1.5 py-0.5 text-[length:calc(11px*var(--font-scale))] text-teal-deep">{tripPlace.status === 'unassigned' ? '미분류' : '후보'}</span>}
                      <button type="button" onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'date'); }}
                        aria-label={`${card.title} 방문 일정 수정${cardDateLabel ? `: ${cardDateLabel}${cardTime ? ` · ${cardTime}` : ''}` : ''}`}
                        className="inline-flex items-center gap-1 rounded-md border-none bg-paper px-2 py-0.5 text-xs font-semibold text-teal-deep cursor-pointer hover:bg-sand">
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M6 3.6V6l1.6 1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                        {tripPlace.status === 'scheduled' ? scheduleText || '시간 추가' : '일정에 추가'}
                      </button>
                      {cardPopover?.id === card.id && cardPopover.kind === 'date' && <CardDateEditor key={`date-${card.id}`} item={tripPlace} card={card} onClose={() => setCardPopover(null)} />}
                    </div>}
                    {!tripPlace && (card.day.startsWith('DAY') || card.time) && <div className="px-3 mb-1.5 text-xs font-semibold text-teal-deep">{[card.day.startsWith('DAY') ? card.day : '', card.time ? `방문 예정 ${card.time}` : ''].filter(Boolean).join(' · ')}</div>}

                    {card.address && <p className="px-3 mt-0.5 mb-2 truncate text-xs text-ink-soft" title={card.address}>{card.address}</p>}

                    {card.imageUrl && <div className="h-[90px] bg-sand bg-cover bg-center" style={{ backgroundImage: `url('${card.imageUrl}')` }} />}

                    {card.description && <p onDoubleClick={(event) => { event.stopPropagation(); toggleCardPopover(card.id, 'full'); }}
                      className="px-3 py-2 m-0 text-[length:calc(13px*var(--font-scale))] leading-relaxed text-ink-soft line-clamp-3">{card.description}</p>}
                    {tripPlace?.note && tripPlace.note !== card.description && <p className="px-3 py-1 m-0 text-[length:calc(13px*var(--font-scale))] text-ink-soft line-clamp-2">{tripPlace.note}</p>}

                    {tripPlace?.cost !== null && tripPlace?.cost !== undefined && <div className="mx-3 mb-2 text-xs text-ink-soft">
                      예상 비용 · {tripPlace.costBasis === 'per_person' ? '1인' : '일행 전체'} <span className="font-mono tabular-nums">{tripPlace.cost.toLocaleString('ko-KR')}원</span>
                    </div>}
                    {reservationUrl && <a href={reservationUrl} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="mx-3 mb-2 inline-block text-xs text-teal-deep underline">예약 확인</a>}
                    {isSelected && <div className="mx-3 mb-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
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
                <h4 className="m-0 mb-3 text-[length:calc(13px*var(--font-scale))] font-display font-semibold text-teal-deep">카드 목록 ({cards.length})</h4>
                {cards.length ? (
                  <div className="flex flex-col gap-2">
                    {cards.map((card) => (
                      <div key={card.id} className="flex items-center gap-2 text-xs text-ink-soft">
                        <span className="text-[length:calc(10px*var(--font-scale))] text-muted">{card.placeId ? '장소' : card.imageUrl ? '사진' : card.kind === 'text' ? '텍스트' : '메모'}</span>
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
                <p className="m-0 text-xs leading-relaxed text-muted">저장한 일정판은 공유 메뉴에서 가입한 친구를 편집자로 추가할 수 있어요.</p>
              </div>
            </aside>
          )}
        </div>
      </div>

      {shareInfoOpen && <BoardShareDialog boardId={boardId} onClose={() => setShareInfoOpen(false)} />}

    </>
  );
}
