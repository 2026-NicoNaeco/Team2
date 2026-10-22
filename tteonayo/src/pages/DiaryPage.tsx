import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import BoardShareDialog from '../components/BoardShareDialog';
import { useTrip } from '../context/TripContext';
import { BoardApiError, deleteBoard, listBoards } from '../services/boards';
import type { BoardApiSummary } from '../types';

const roleLabel = { owner: '소유자', editor: '편집자', viewer: '열람자' };

export default function DiaryPage() {
  const navigate = useNavigate();
  const { savedBoards, hasUnsavedBoardChanges, createBoard } = useTrip();
  const [boards, setBoards] = useState<BoardApiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingBoard, setSharingBoard] = useState<BoardApiSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBoards().then((items) => {
      if (!cancelled) setBoards(items);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '일정판 목록을 불러오지 못했어요.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const migratedIds = new Set(boards.map((board) => board.legacyBoardId).filter(Boolean));
  const archivedCount = savedBoards.filter((board) => !migratedIds.has(board.id)).length;
  const openBoard = (id: string) => {
    if (hasUnsavedBoardChanges && !window.confirm('저장하지 않은 일정판 변경사항이 있습니다. 다른 일정판을 열까요?')) return;
    navigate(`/board/${id}`);
  };
  const removeBoard = async (board: BoardApiSummary) => {
    if (!window.confirm(`'${board.title}' 일정판을 삭제할까요? 카드와 동선도 함께 목록에서 사라집니다.`)) return;
    setDeletingId(board.id);
    setError('');
    try {
      await deleteBoard(board.id);
      setBoards((items) => items.filter((item) => item.id !== board.id));
    } catch (reason: unknown) {
      setError(reason instanceof BoardApiError && reason.status === 403
        ? '이 일정판을 삭제할 권한이 없어요. 목록을 다시 확인해 주세요.'
        : reason instanceof Error ? reason.message : '일정판을 삭제하지 못했어요.');
    } finally {
      setDeletingId(null);
    }
  };
  const startBoard = () => {
    if (hasUnsavedBoardChanges && !window.confirm('저장하지 않은 일정판 변경사항이 있습니다. 새 일정판을 만들까요?')) return;
    createBoard();
    navigate('/board');
  };

  return (
    <>
      <Topbar title="여행 일정 기록함" stamp={`저장한 일정판 ${boards.length}개`} />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="m-0 font-display text-[length:calc(24px*var(--font-scale))] font-semibold text-ink">내 일정판</h1>
              <p className="m-0 mt-2 text-sm text-muted">저장한 여행 동선을 다시 열어 확인할 수 있어요.</p>
            </div>
            <button type="button" onClick={startBoard} className="px-4 py-2.5 rounded-xl bg-teal-deep text-white text-sm font-semibold cursor-pointer border-none">＋ 새 일정판</button>
          </div>
          {!loading && !error && archivedCount > 0 && <p role="status" className="mb-5 rounded-xl border border-line bg-white p-4 text-sm text-ink-soft">
            이전 형식 일정판 {archivedCount}개는 원본으로 보관 중입니다. 새 목록에서 열려면 관리자에게 데이터 이전을 요청해 주세요.
          </p>}
          {error && <p role="alert" className="mb-5 rounded-xl border border-line bg-white p-4 text-sm text-pin">{error}</p>}
          {loading ? <p role="status" className="text-sm text-muted">일정판을 불러오는 중...</p> : boards.length ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {boards.map((board) => (
                <article key={board.id} className="bg-white border border-line rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="m-0 font-display text-[length:calc(18px*var(--font-scale))] font-semibold text-teal-deep break-words">{board.title}</h2>
                      <p className="m-0 mt-2 text-xs text-muted">{new Date(board.updatedAt).toLocaleString('ko-KR')} 수정</p>
                    </div>
                    <span className="shrink-0 text-xs text-teal-deep">{roleLabel[board.role]}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                    <button type="button" onClick={() => openBoard(board.id)} className="px-3.5 py-2 rounded-lg bg-teal-deep text-white text-xs font-semibold cursor-pointer border-none">
                      {board.role === 'viewer' ? '일정판 보기' : '화이트보드에서 수정'}
                    </button>
                    {board.role === 'owner' && <button type="button" onClick={() => setSharingBoard(board)} className="px-3.5 py-2 rounded-lg bg-paper text-teal-deep text-xs font-semibold cursor-pointer border border-line">공유</button>}
                    {board.role === 'owner' && <button type="button" disabled={deletingId === board.id} onClick={() => { void removeBoard(board); }} className="ml-auto px-3.5 py-2 rounded-lg bg-white text-pin text-xs cursor-pointer border border-line disabled:opacity-50">삭제</button>}
                  </div>
                </article>
              ))}
            </div>
          ) : !error && (
            <div className="min-h-[320px] bg-white border border-line rounded-xl flex flex-col items-center justify-center text-center gap-3 p-6">
              <p className="m-0 text-[length:calc(16px*var(--font-scale))] font-semibold text-ink">아직 저장한 일정판이 없어요.</p>
              <p className="m-0 text-sm text-muted">장소와 메모, 사진 카드를 배치하고 동선을 연결해 보세요.</p>
              <button type="button" onClick={startBoard} className="mt-2 px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-semibold cursor-pointer border-none">일정판 만들기</button>
            </div>
          )}
          <p className="mt-5 text-xs text-muted">소유자는 공유 메뉴에서 가입한 친구를 편집자로 추가할 수 있어요.</p>
        </div>
      </div>
      {sharingBoard && <BoardShareDialog boardId={sharingBoard.id} onClose={() => setSharingBoard(null)} />}
    </>
  );
}
