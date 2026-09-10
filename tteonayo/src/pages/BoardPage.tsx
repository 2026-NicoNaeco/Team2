import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';

const CARD_WIDTH = 210;

// 공동 편집 참여자 (Firebase Realtime DB 연동 예정 — 지금은 데모용 목데이터)
const COLLABORATORS = [
  { name: '수진', status: '편집 중', color: '#2F6F6B', dot: true },
  { name: '민준', status: '메모 추가 완료 · 1분 전', color: '#C77D30', dot: false },
  { name: '하은', status: '사진 업로드 완료 · 3분 전', color: '#D64545', dot: false },
];

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
        if (!ctx) return resolve(reader.result as string);
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
  } = useTrip();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'description' } | null>(null);

  // ── 친구 초대 (공유) — TODO: 백엔드 연동 시 실제 공유 링크/초대 메일로 교체 ──
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<{ email: string; role: '편집 가능' | '보기 전용' }[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviteRole, setInviteRole] = useState<'편집 가능' | '보기 전용'>('편집 가능');
  const [shareToken] = useState(() => crypto.randomUUID().slice(0, 8));
  const shareLink = `${window.location.origin}/board?invite=${shareToken}`;

  const shareInputRef = useRef<HTMLInputElement>(null);
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch {
      // 클립보드 API가 막힌 환경 — 링크를 선택 상태로 만들어 수동 복사(Ctrl+C) 유도
      shareInputRef.current?.select();
      try {
        document.execCommand('copy');
      } catch {
        /* 무시 */
      }
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const sendInvite = () => {
    const email = inviteEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    setInvites((prev) => (prev.some((i) => i.email === email) ? prev : [...prev, { email, role: inviteRole }]));
    setInviteEmail('');
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
    let dataUrl: string;
    try {
      dataUrl = await downscaleImage(file);
    } catch {
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
    moveBoardCard(id, e.clientY - rect.top - offsetY, e.clientX - rect.left - offsetX);
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
      <Topbar title="여행 다이어리 · 일정판" stamp={connectMode ? '선 연결 모드' : '드래그 앤 편집 모드'} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap print:hidden">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => addBlankBoardCard({ icon: '📍', title: '새 장소', description: '' })}
              className={toolBtn}
            >
              📍 장소 추가
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
              👥 공동 편집
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

        <p className="text-xs text-[#8B8272] mb-2 print:hidden">
          {connectMode
            ? '카드를 두 개 클릭하면 동선이 이어져요. 선을 클릭하면 삭제됩니다.'
            : '카드를 드래그해 옮기고, 제목·메모를 더블클릭하면 수정돼요. 빈 공간 더블클릭 시 새 카드가 추가됩니다.'}
        </p>

        <div className="flex gap-5">
          {/* 캔버스 */}
          <div className="flex-1 h-[calc(100vh-290px)] bg-white border border-line rounded-2xl overflow-auto print:h-auto print:overflow-visible print:border-0">
            <div
              id="board-canvas"
              ref={canvasRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={handleCanvasDoubleClick}
              className="relative w-[980px] h-[620px]"
              style={{
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

                    <div className="px-3.5 pt-3 pb-2 flex items-center gap-2">
                      {card.icon && <span className="text-[15px]">{card.icon}</span>}
                      {editing?.id === card.id && editing.field === 'title' ? (
                        <input
                          autoFocus
                          defaultValue={card.title}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v) updateBoardCard(card.id, { title: v });
                            setEditing(null);
                          }}
                          className="m-0 flex-1 min-w-0 text-[13.5px] font-semibold text-teal-deep border-b border-teal bg-transparent outline-none"
                        />
                      ) : (
                        <h5
                          onDoubleClick={(e) => {
                            if (connectMode) return;
                            e.stopPropagation();
                            setEditing({ id: card.id, field: 'title' });
                          }}
                          title="더블클릭해서 수정"
                          className="m-0 text-[13.5px] text-teal-deep leading-tight flex-1 min-w-0 truncate"
                        >
                          {card.title}
                        </h5>
                      )}
                    </div>

                    {(card.day || card.time) && (
                      <div className="px-3.5 -mt-1 mb-1.5 flex items-center gap-1.5 text-[10.5px] text-pin font-mono font-semibold">
                        {card.day && <span>{card.day}</span>}
                        {card.time && <span>⏱ {card.time}</span>}
                      </div>
                    )}

                    {card.imageUrl ? (
                      <div
                        className="relative h-[86px] bg-sand bg-cover bg-center"
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
                        className="mx-3.5 mb-1.5 w-[calc(100%-28px)] border border-dashed border-line rounded-lg py-1.5 text-[10.5px] text-[#8B8272] cursor-pointer hover:border-teal hover:text-teal transition-colors"
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
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        onBlur={(e) => {
                          updateBoardCard(card.id, { description: e.target.value.trim() });
                          setEditing(null);
                        }}
                        className="mx-3.5 my-2 w-[calc(100%-28px)] h-[52px] text-[11px] text-[#4A5560] leading-relaxed border border-teal rounded-md p-1.5 bg-paper outline-none resize-none"
                      />
                    ) : (
                      <p
                        onDoubleClick={(e) => {
                          if (connectMode) return;
                          e.stopPropagation();
                          setEditing({ id: card.id, field: 'description' });
                        }}
                        title="더블클릭해서 수정"
                        className={`px-3.5 py-2 m-0 text-[11px] leading-relaxed ${
                          card.description ? 'text-[#8B8272]' : 'text-[#B7AE97] italic'
                        }`}
                      >
                        {card.description || '더블클릭해서 메모 입력'}
                      </p>
                    )}

                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/map');
                      }}
                      className="mx-3.5 mb-3 w-[calc(100%-28px)] bg-paper text-teal-deep text-[11px] rounded-lg py-1.5 cursor-pointer border border-line hover:border-teal transition-colors"
                    >
                      📖 지도 보기
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 공동 편집 패널 */}
          {showPanel && (
            <div className="w-[260px] shrink-0 flex flex-col gap-4 print:hidden">
              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className="m-0 text-[13px] font-display font-semibold text-teal-deep">
                    👥 공동 편집
                  </h4>
                  <button
                    onClick={() => setShowInvite(true)}
                    className="text-[11px] font-semibold text-teal-deep bg-sand rounded-full px-2.5 py-1 cursor-pointer hover:bg-[#DCCFA8] transition-colors"
                  >
                    ＋ 초대
                  </button>
                </div>
                <p className="m-0 mb-3 text-[11px] text-[#8B8272]">
                  {COLLABORATORS.length}명 참여 중
                  {invites.length > 0 && ` · ${invites.length}명 초대됨`}
                </p>
                <div className="flex flex-col gap-3">
                  {COLLABORATORS.map((c) => (
                    <div key={c.name} className="flex items-center gap-2.5">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                        style={{ background: c.color }}
                      >
                        {c.name[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold flex items-center gap-1.5">
                          {c.name}님
                          {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-teal inline-block" />}
                        </div>
                        <div className="text-[10.5px] text-[#8B8272] truncate">{c.status}</div>
                      </div>
                    </div>
                  ))}
                  {invites.map((inv) => (
                    <div key={inv.email} className="flex items-center gap-2.5 opacity-70">
                      <span className="w-7 h-7 rounded-full bg-line flex items-center justify-center text-[11px] shrink-0">
                        ✉️
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold truncate">{inv.email}</div>
                        <div className="text-[10.5px] text-[#8B8272]">{inv.role} · 수락 대기</div>
                      </div>
                      <button
                        onClick={() => setInvites((prev) => prev.filter((i) => i.email !== inv.email))}
                        className="shrink-0 text-[11px] text-[#8B8272] hover:text-pin cursor-pointer"
                        aria-label="초대 취소"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <h4 className="m-0 mb-2 text-xs uppercase tracking-wide text-[#8B8272]">최근 변경사항</h4>
                <ul className="m-0 pl-0 list-none flex flex-col gap-1.5">
                  {activityLog.map((a, i) => (
                    <li key={i} className="text-[12px] text-[#4A5560] flex gap-1.5">
                      <span className="text-teal">•</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white border border-line rounded-2xl px-4 py-4">
                <h4 className="m-0 mb-2 text-xs uppercase tracking-wide text-[#8B8272]">
                  카드 목록 ({cards.length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {cards.map((card) => (
                    <div key={card.id} className="flex items-center gap-2 text-[12px]">
                      <span className="shrink-0">{card.icon ?? '•'}</span>
                      <span className="truncate flex-1">{card.title}</span>
                      <button
                        onClick={() => removeBoardCard(card.id)}
                        className="shrink-0 text-pin text-[11px] cursor-pointer bg-transparent border-none hover:underline"
                        aria-label="카드 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 친구 초대 모달 (캔바처럼 링크/메일로 초대) */}
      {showInvite && (
        <div
          className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[380px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="m-0 text-[15px] font-display font-semibold text-teal-deep">
                일정판에 친구 초대
              </h3>
              <button
                onClick={() => setShowInvite(false)}
                className="text-[#8B8272] hover:text-ink cursor-pointer text-[15px] leading-none"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="m-0 mb-4 text-[12px] text-[#8B8272]">
              링크를 공유하거나 이메일로 초대하면 함께 일정을 편집할 수 있어요.
            </p>

            {/* 공유 링크 */}
            <label className="text-[11px] font-semibold text-[#7A7364] block mb-1">공유 링크</label>
            <div className="flex gap-2 mb-4">
              <input
                ref={shareInputRef}
                readOnly
                value={shareLink}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 border border-line rounded-lg px-2.5 py-2 text-[12px] bg-paper text-[#4A5560] outline-none"
              />
              <button
                onClick={copyShareLink}
                className="shrink-0 bg-teal-deep text-white rounded-lg px-3 text-[12px] font-semibold cursor-pointer hover:bg-teal transition-colors"
              >
                {linkCopied ? '복사됨 ✓' : '링크 복사'}
              </button>
            </div>

            {/* 이메일 초대 */}
            <label className="text-[11px] font-semibold text-[#7A7364] block mb-1">
              이메일로 초대
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                placeholder="friend@example.com"
                className="flex-1 min-w-0 border border-line rounded-lg px-2.5 py-2 text-[12px] outline-none focus:border-teal"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as '편집 가능' | '보기 전용')}
                className="shrink-0 border border-line rounded-lg px-1.5 text-[11px] bg-white outline-none cursor-pointer"
              >
                <option>편집 가능</option>
                <option>보기 전용</option>
              </select>
              <button
                onClick={sendInvite}
                className="shrink-0 bg-teal-deep text-white rounded-lg px-3 text-[12px] font-semibold cursor-pointer hover:bg-teal transition-colors"
              >
                보내기
              </button>
            </div>

            {invites.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-semibold text-[#7A7364] mb-1.5">
                  초대한 사람 ({invites.length})
                </div>
                <div className="flex flex-col gap-1.5">
                  {invites.map((inv) => (
                    <div
                      key={inv.email}
                      className="flex items-center gap-2 text-[12px] bg-paper rounded-lg px-2.5 py-1.5"
                    >
                      <span className="truncate flex-1">{inv.email}</span>
                      <span className="text-[10.5px] text-[#8B8272]">{inv.role} · 대기</span>
                      <button
                        onClick={() =>
                          setInvites((prev) => prev.filter((i) => i.email !== inv.email))
                        }
                        className="text-[#8B8272] hover:text-pin cursor-pointer"
                        aria-label="초대 취소"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="m-0 mt-4 text-[10.5px] text-[#B7AE97]">
              * 데모 화면입니다. 실제 링크·메일 발송은 백엔드 연동 후 동작해요.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
