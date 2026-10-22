import { useEffect, useState, type FormEvent } from 'react';
import { addBoardMember, getBoard, removeBoardMember } from '../services/boards';
import type { BoardApiBoard } from '../types';

const roleLabel = { owner: '소유자', editor: '편집자', viewer: '열람자' };

export default function BoardShareDialog({ boardId, onClose }: { boardId?: string; onClose: () => void }) {
  const [board, setBoard] = useState<BoardApiBoard | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(Boolean(boardId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void getBoard(boardId).then((result) => {
      if (!cancelled) setBoard(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '참여자를 불러오지 못했어요.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [boardId]);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!boardId || busy || !email.trim()) return;
    setBusy(true);
    setError('');
    try {
      setBoard(await addBoardMember(boardId, email.trim()));
      setEmail('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '추가할 수 없어요.');
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: number, nickname: string) => {
    if (!boardId || busy || !window.confirm(`${nickname}님을 이 일정판에서 제거할까요?`)) return;
    setBusy(true);
    setError('');
    try {
      await removeBoardMember(boardId, userId);
      setBoard(await getBoard(boardId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '참여자를 제거하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/30 p-4 print:hidden" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label="일정판 공유" className="w-full max-w-[420px] rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-teal-deep">일정판 공유</h2>
        <button type="button" onClick={onClose} aria-label="닫기" className="border-none bg-transparent text-muted cursor-pointer">닫기</button>
      </div>
      {!boardId ? <p className="my-4 text-sm text-ink-soft">일정판을 먼저 저장하면 참여자를 추가할 수 있어요.</p> : <>
        {loading && <p role="status" className="my-4 text-sm text-muted">참여자를 불러오는 중...</p>}
        {board?.role === 'owner' && <form onSubmit={(event) => { void addMember(event); }} className="mt-5 flex flex-col gap-2">
          <label htmlFor="board-member-email" className="text-sm text-ink-soft">친구 계정 이메일</label>
          <div className="flex gap-2">
            <input id="board-member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="email" required maxLength={254} placeholder="가입한 이메일"
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm text-ink" />
            <button type="submit" disabled={busy || !email.trim() || board.members.length >= 4}
              className="rounded-lg border-none bg-teal-deep px-3 py-2 text-sm text-white cursor-pointer disabled:opacity-50">추가</button>
          </div>
        </form>}
        {board && <div className="mt-5">
          <h3 className="m-0 mb-2 text-sm font-semibold text-ink">참여자 {board.members.length}/4</h3>
          <ul className="m-0 p-0 list-none divide-y divide-line">
            {board.members.map((member) => <li key={member.userId} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0 break-words text-ink">{member.nickname} · {roleLabel[member.role]}</span>
              {board.role === 'owner' && member.role !== 'owner' &&
                <button type="button" disabled={busy} onClick={() => { void removeMember(member.userId, member.nickname); }}
                  className="shrink-0 border-none bg-transparent text-pin cursor-pointer disabled:opacity-50">제거</button>}
            </li>)}
          </ul>
        </div>}
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-pin">{error}</p>}
    </div>
  </div>;
}
