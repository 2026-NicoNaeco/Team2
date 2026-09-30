import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';

const CARD_WIDTH = 220;

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
    removeConnection,
    activityLog,
    places,
    savedIds,
    memos,
    addBoardCard,
    savedBoards,
    activeBoardId,
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
      JSON.stringify(connections) !== JSON.stringify(activeBoard.connections)
    : cards.length > 0 || connections.length > 0;

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'description' } | null>(null);
  const canvasWidth = Math.max(1200, ...cards.map((card) => card.left + CARD_WIDTH + 80));
  const canvasHeight = Math.max(780, ...cards.map((card) => card.top + 270));

  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  const saveCurrentBoard = () => {
    try {
      saveBoard(boardTitle);
      setSaveError('');
      setSaveMessage('일정판을 기록함에 저장했어요.');
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
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null); // 교체할 카드 id, null이면 새 카드

  const cardById = (id: string) => cards.find((c) => c.id === id);

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
        icon: '📷',
        title: file.name.replace(/\.[^.]+$/, '').slice(0, 20) || '새 사진',
        description: '',
        imageUrl: dataUrl,
      });
    }
  };

  // ── 드래그 이동 ──────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent, id: string, top: number, left: number) => {
    if (connectMode) return;
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
    dragState.current = null;
    setDraggingId(null);
  };

  // ── 선 연결 ─────────────────────────────────────────────────
  const handleCardClick = (id: string) => {
    if (!connectMode) return;
    if (linkFrom === null) {
      setLinkFrom(id);
    } else if (linkFrom === id) {
      setLinkFrom(null);
    } else {
      addConnection(linkFrom, id);
      setLinkFrom(null);
    }
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (connectMode || e.target !== canvasRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    addBlankBoardCard({
      top: e.clientY - rect.top - 20,
      left: e.clientX - rect.left - CARD_WIDTH / 2,
    });
  };

  const toggleConnectMode = () => {
    setConnectMode((v) => !v);
    setLinkFrom(null);
  };

  const toolBtn =
    'border border-line bg-white px-3 py-2 rounded-lg text-xs cursor-pointer hover:bg-paper transition-colors';

  return (
    <>
      <Topbar title="여행 동선 · 일정판" stamp={connectMode ? '선 연결 모드' : '드래그 앤 편집 모드'} />
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
        <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
          <input
            aria-label="일정판 이름"
            value={boardTitle}
            maxLength={80}
            onChange={(event) => { setBoardTitle(event.target.value); setSaveMessage(''); setSaveError(''); }}
            className="min-w-[220px] flex-1 max-w-[420px] rounded-xl border border-line bg-white px-4 py-2.5 font-display text-[16px] font-semibold text-ink outline-teal"
          />
          <button type="button" onClick={saveCurrentBoard} disabled={!boardTitle.trim()}
            className="rounded-xl bg-teal-deep text-white px-4 py-2.5 text-sm font-semibold cursor-pointer border-none disabled:opacity-50">
            기록함에 저장
          </button>
          <button type="button" onClick={startNewBoard} className="rounded-xl border border-line bg-white text-teal-deep px-4 py-2.5 text-sm cursor-pointer">새 일정판</button>
          <button type="button" onClick={() => navigate('/diary')} className="rounded-xl border border-line bg-white text-teal-deep px-4 py-2.5 text-sm cursor-pointer">기록함 보기</button>
          <span role="status" className="text-xs text-teal-deep">
            {hasUnsavedChanges ? '저장되지 않은 변경사항' : saveMessage}
          </span>
          {saveError && <span role="alert" className="text-xs text-pin">{saveError}</span>}
          {uploadError && <span role="alert" className="text-xs text-pin">{uploadError}</span>}
        </div>
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap print:hidden">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowPlaces((value) => !value)}
              className={toolBtn}
            >
              📍 저장한 장소 불러오기
            </button>
            <button
              onClick={() =>
                addBlankBoardCard({ day: '메모', icon: '📝', title: '새 메모', description: '' })
              }
              className={toolBtn}
            >
              📝 메모 추가
            </button>
            <button onClick={() => openPhotoPicker(null)} className={toolBtn}>
              📷 사진 추가
            </button>
            <button
              onClick={toggleConnectMode}
              className={`${toolBtn} ${connectMode ? 'bg-teal-deep text-white border-teal-deep hover:bg-teal-deep' : ''}`}
            >
              🔗 선 연결 {connectMode ? 'ON' : ''}
            </button>
            <button
              onClick={() => setShowPanel((v) => !v)}
              className={`${toolBtn} ${showPanel ? 'bg-paper' : ''}`}
            >
              {showPanel ? '카드 목록 닫기' : '카드 목록 보기'}
            </button>
            <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-pressed={isExpanded}
              className={toolBtn}>
              {isExpanded ? '↙ 기본 화면' : '⛶ 화면 크게'}
            </button>
          </div>
          {/* PDF 저장: 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택 */}
          <button
            onClick={() => window.print()}
            className="bg-teal-deep text-white border-none px-3.5 py-2 rounded-lg text-xs cursor-pointer"
          >
            📄 PDF 저장
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
                        day: '저장한 장소', icon: place.icon, title: place.name,
                        description: memos[place.id] || place.description, placeId: place.id,
                      })}
                      className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-soft cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      {place.icon} {place.name} {added ? '✓ 추가됨' : '＋ 카드로 추가'}
                    </button>
                  );
                })}
              </div>
            ) : <p className="m-0 text-xs text-muted">아직 저장한 장소가 없어요. 지도에서 장소를 저장해 주세요.</p>}
          </div>
        )}

        <p className="text-xs text-[#8B8272] mb-2 print:hidden">
          {connectMode
            ? '카드를 두 개 클릭하면 동선이 이어져요. 선을 클릭하면 삭제됩니다.'
            : '카드를 드래그해 옮기고, 제목·메모를 더블클릭하면 수정돼요. 빈 공간 더블클릭 시 새 카드가 추가됩니다.'}
        </p>

        <div className="flex flex-col xl:flex-row gap-5">
          {/* 캔버스 */}
          <div className={`min-w-0 flex-1 bg-white border border-line rounded-2xl overflow-auto print:h-auto print:overflow-visible print:border-0 ${
            isExpanded ? 'h-[calc(100dvh-240px)] min-h-[520px]' : 'h-[calc(100dvh-220px)] min-h-[640px]'
          }`}>
            <div
              id="board-canvas"
              ref={canvasRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleCanvasDoubleClick}
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
                {connections.map((cn, i) => {
                  const a = cardById(cn.from);
                  const b = cardById(cn.to);
                  if (!a || !b) return null;
                  const x1 = a.left + CARD_WIDTH / 2;
                  const y1 = a.top + 20;
                  const x2 = b.left + CARD_WIDTH / 2;
                  const y2 = b.top + 20;
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  return (
                    <g
                      key={cn.id}
                      style={{
                        pointerEvents: connectMode ? 'auto' : 'none',
                        cursor: connectMode ? 'pointer' : 'default',
                      }}
                      onClick={() => connectMode && removeConnection(cn.id)}
                    >
                      {/* 클릭 판정용 두꺼운 투명선 */}
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={connectMode ? '#D64545' : '#2F6F6B'}
                        strokeWidth={2}
                        strokeDasharray="6 5"
                      />
                      <circle cx={mx} cy={my} r={9} fill={connectMode ? '#D64545' : '#2F6F6B'} />
                      <text
                        x={mx}
                        y={my + 3.5}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#fff"
                        fontWeight="700"
                      >
                        {connectMode ? '✕' : i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {cards.map((card) => {
                const isLinkSource = linkFrom === card.id;
                return (
                  <div
                    key={card.id}
                    onPointerDown={(e) => handlePointerDown(e, card.id, card.top, card.left)}
                    onClick={() => handleCardClick(card.id)}
                    className={`group absolute bg-white border rounded-xl select-none transition-shadow ${
                      draggingId === card.id
                        ? 'shadow-2xl cursor-grabbing z-30'
                        : connectMode
                          ? 'cursor-pointer shadow-md z-[2]'
                          : 'shadow-md cursor-grab z-[2]'
                    } ${isLinkSource ? 'border-pin ring-2 ring-pin' : 'border-line'}`}
                    style={{ top: card.top, left: card.left, width: CARD_WIDTH }}
                  >
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBoardCard(card.id);
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-line text-[#B7AE97] text-[11px] leading-none shadow-sm hover:text-white hover:bg-pin hover:border-pin transition-colors cursor-pointer"
                      aria-label="카드 삭제"
                    >
                      ✕
                    </button>

                    <div className="px-3 pt-3 pb-2 flex items-center gap-2">
                      {card.icon && <span className="text-base">{card.icon}</span>}
                      {editing?.id === card.id && editing.field === 'title' ? (
                        <input
                          autoFocus
                          defaultValue={card.title}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { e.currentTarget.value = card.title; e.currentTarget.blur(); }
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v) updateBoardCard(card.id, { title: v });
                            setEditing(null);
                          }}
                          className="m-0 flex-1 min-w-0 text-sm font-semibold text-teal-deep border-b border-teal bg-transparent outline-none"
                        />
                      ) : (
                        <h5
                          onDoubleClick={(e) => {
                            if (connectMode) return;
                            e.stopPropagation();
                            setEditing({ id: card.id, field: 'title' });
                          }}
                          title="더블클릭해서 수정"
                          className="m-0 text-sm text-teal-deep leading-tight flex-1 min-w-0 truncate"
                        >
                          {card.title}
                        </h5>
                      )}
                      {!connectMode && <button type="button" onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setEditing({ id: card.id, field: 'title' }); }}
                        className="shrink-0 bg-transparent border-none text-xs text-teal cursor-pointer" aria-label={`${card.title} 제목 수정`}>
                        수정
                      </button>}
                    </div>

                    {(card.day || card.time) && (
                      <div className="px-3 -mt-1 mb-2 flex items-center gap-1.5 text-[11px] text-pin font-mono font-semibold">
                        {card.day && <span>{card.day}</span>}
                        {card.time && <span>⏱ {card.time}</span>}
                      </div>
                    )}

                    {card.imageUrl ? (
                      <div
                        className="relative h-[90px] bg-sand bg-cover bg-center"
                        style={{ backgroundImage: `url('${card.imageUrl}')` }}
                      >
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateBoardCard(card.id, { imageUrl: undefined });
                          }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] leading-none cursor-pointer hover:bg-pin transition-colors"
                          aria-label="사진 삭제"
                        >
                          ✕
                        </button>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPhotoPicker(card.id);
                          }}
                          className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] rounded-md px-1.5 py-0.5 cursor-pointer hover:bg-black/80 transition-colors"
                        >
                          사진 변경
                        </button>
                      </div>
                    ) : (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPhotoPicker(card.id);
                        }}
                        className="mx-3 mb-2 w-[calc(100%-24px)] border border-dashed border-line rounded-lg py-1.5 text-[11px] text-[#8B8272] cursor-pointer hover:border-teal hover:text-teal transition-colors"
                      >
                        ＋ 사진 추가
                      </button>
                    )}

                    {editing?.id === card.id && editing.field === 'description' ? (
                      <textarea
                        autoFocus
                        defaultValue={card.description}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { e.currentTarget.value = card.description; e.currentTarget.blur(); }
                        }}
                        onBlur={(e) => {
                          updateBoardCard(card.id, { description: e.target.value.trim() });
                          setEditing(null);
                        }}
                        className="mx-3 my-2 w-[calc(100%-24px)] h-[72px] text-xs text-[#4A5560] leading-relaxed border border-teal rounded-md p-2 bg-paper outline-none resize-y"
                      />
                    ) : (
                      <p
                        onDoubleClick={(e) => {
                          if (connectMode) return;
                          e.stopPropagation();
                          setEditing({ id: card.id, field: 'description' });
                        }}
                        title="더블클릭해서 수정"
                        className={`px-3 py-2 m-0 text-xs leading-relaxed ${
                          card.description ? 'text-[#8B8272]' : 'text-[#B7AE97] italic'
                        }`}
                      >
                        {card.description || '더블클릭해서 메모 입력'}
                      </p>
                    )}
                    {!connectMode && <button type="button" onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setEditing({ id: card.id, field: 'description' }); }}
                      className="mx-3 mb-2 bg-transparent border-none text-[11px] text-teal cursor-pointer" aria-label={`${card.title} 메모 수정`}>
                      메모 수정
                    </button>}

                    {card.placeId && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/map?placeId=${encodeURIComponent(card.placeId!)}`);
                        }}
                        className="mx-3 mb-3 w-[calc(100%-24px)] bg-paper text-teal-deep text-[11px] rounded-lg py-1.5 cursor-pointer border border-line hover:border-teal transition-colors"
                      >
                        📖 지도에서 보기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {showPanel && (
            <aside className="w-full xl:w-[260px] shrink-0 flex flex-col gap-4 print:hidden">
              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <h4 className="m-0 mb-3 text-[13px] font-display font-semibold text-teal-deep">카드 목록 ({cards.length})</h4>
                {cards.length ? (
                  <div className="flex flex-col gap-2">
                    {cards.map((card) => (
                      <div key={card.id} className="flex items-center gap-2 text-xs text-ink-soft">
                        <span>{card.icon ?? '•'}</span>
                        <span className="truncate flex-1">{card.title}</span>
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
                <p className="m-0 text-xs leading-relaxed text-muted">공유 링크와 참여자 권한은 서버 저장 기능이 연결된 뒤 사용할 수 있어요. 현재 일정판은 이 브라우저에 저장됩니다.</p>
              </div>
            </aside>
          )}
        </div>
      </div>

    </>
  );
}
