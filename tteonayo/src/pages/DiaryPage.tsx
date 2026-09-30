import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useTrip } from '../context/TripContext';
import type { SavedBoard } from '../types';

function BoardArchiveCard({
  board,
  onEdit,
  onDelete,
  onShare,
}: {
  board: SavedBoard;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (board: SavedBoard) => void;
}) {
  return (
    <article className="bg-white border border-line rounded-2xl p-5 shadow-card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[18px] font-semibold text-teal-deep break-words">{board.title}</h2>
          <p className="m-0 mt-1 text-xs text-muted">
            {new Date(board.updatedAt).toLocaleDateString('ko-KR')} 수정 · 카드 {board.cards.length}개 · 동선 {board.connections.length}개
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-teal-deep bg-paper rounded-full px-2.5 py-1">일정판</span>
      </div>

      <div className="min-h-[95px] border border-dashed border-line rounded-xl bg-paper p-3 flex flex-wrap content-start gap-2">
        {board.cards.length ? board.cards.slice(0, 5).map((card) => (
          <span key={card.id} className="max-w-full truncate bg-white border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink-soft">
            {card.icon ?? '📍'} {card.title}
          </span>
        )) : <span className="text-xs text-muted">아직 카드가 없는 일정판</span>}
        {board.cards.length > 5 && <span className="text-xs text-muted self-center">외 {board.cards.length - 5}개</span>}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => onEdit(board.id)} className="px-3.5 py-2 rounded-lg bg-teal-deep text-white text-xs font-semibold cursor-pointer border-none">
          화이트보드에서 수정
        </button>
        <button type="button" onClick={() => onShare(board)} className="px-3.5 py-2 rounded-lg bg-paper text-teal-deep text-xs font-semibold cursor-pointer border border-line">
          공유
        </button>
        <button type="button" onClick={() => onDelete(board.id)} className="ml-auto px-3.5 py-2 rounded-lg bg-white text-pin text-xs cursor-pointer border border-line">
          삭제
        </button>
      </div>
    </article>
  );
}

export default function DiaryPage() {
  const navigate = useNavigate();
  const { savedBoards, activeBoardId, hasUnsavedBoardChanges, openBoard, createBoard, deleteBoard } = useTrip();
  const [sharingBoard, setSharingBoard] = useState<SavedBoard | null>(null);
  const orderedBoards = [...savedBoards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const editBoard = (id: string) => {
    if (id !== activeBoardId && hasUnsavedBoardChanges && !window.confirm('저장하지 않은 일정판 변경사항이 있습니다. 다른 일정판을 열까요?')) return;
    if (openBoard(id)) navigate('/board');
  };
  const removeBoard = (id: string) => {
    const board = savedBoards.find((item) => item.id === id);
    if (board && window.confirm(`'${board.title}' 일정판을 삭제할까요? 카드와 동선도 함께 삭제됩니다.`)) {
      try { deleteBoard(id); }
      catch { window.alert('일정판을 삭제하지 못했습니다. 브라우저 저장 공간을 확인해주세요.'); }
    }
  };
  const startBoard = () => {
    if (hasUnsavedBoardChanges && !window.confirm('저장하지 않은 일정판 변경사항이 있습니다. 새 일정판을 만들까요?')) return;
    createBoard();
    navigate('/board');
  };

  return (
    <>
      <Topbar title="여행 일정 기록함" stamp={`저장한 일정판 ${savedBoards.length}개`} />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="m-0 font-display text-[24px] font-semibold text-ink">내 일정판</h1>
              <p className="m-0 mt-2 text-sm text-muted">화이트보드에서 저장한 여행 동선을 다시 열어 수정할 수 있어요.</p>
            </div>
            <button type="button" onClick={startBoard} className="px-4 py-2.5 rounded-xl bg-teal-deep text-white text-sm font-semibold cursor-pointer border-none">
              ＋ 새 일정판
            </button>
          </div>

          {orderedBoards.length ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {orderedBoards.map((board) => (
                <BoardArchiveCard key={board.id} board={board} onEdit={editBoard} onDelete={removeBoard} onShare={setSharingBoard} />
              ))}
            </div>
          ) : (
            <div className="min-h-[320px] bg-white border border-dashed border-line rounded-2xl flex flex-col items-center justify-center text-center gap-3 p-6">
              <span className="text-4xl" aria-hidden="true">🗺️</span>
              <p className="m-0 text-[16px] font-semibold text-ink">아직 저장한 일정판이 없어요.</p>
              <p className="m-0 text-sm text-muted">장소와 메모, 사진 카드를 배치하고 동선을 연결해 보세요.</p>
              <button type="button" onClick={startBoard} className="mt-2 px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-semibold cursor-pointer border-none">일정판 만들기</button>
            </div>
          )}
          <p className="mt-5 text-xs text-muted">현재 일정판은 이 브라우저에 저장됩니다. 공동 편집 링크는 서버 연동 후 제공됩니다.</p>
        </div>
      </div>

      {sharingBoard && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4" onClick={() => setSharingBoard(null)}>
          <div className="bg-white rounded-2xl w-full max-w-[420px] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="일정판 공유" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="m-0 font-display text-lg font-semibold text-teal-deep">{sharingBoard.title} 공유</h2>
              <button type="button" onClick={() => setSharingBoard(null)} aria-label="닫기" className="text-muted bg-transparent border-none cursor-pointer">✕</button>
            </div>
            <p className="text-sm text-ink-soft leading-relaxed mt-4 mb-2">친구와 같은 일정판을 편집하는 기능은 서버 저장과 참여자 권한 설정이 연결된 뒤 사용할 수 있어요.</p>
            <p className="text-xs text-muted m-0">지금은 내 브라우저에만 저장되어 있어 링크를 보내도 친구가 이 일정판을 볼 수 없습니다.</p>
            <button type="button" onClick={() => setSharingBoard(null)} className="mt-5 w-full py-2.5 rounded-lg bg-teal-deep text-white text-sm cursor-pointer border-none">확인</button>
          </div>
        </div>
      )}
    </>
  );
}
