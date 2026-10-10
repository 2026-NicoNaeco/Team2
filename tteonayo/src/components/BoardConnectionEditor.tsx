import { useState } from 'react';
import type { BoardConnection } from '../types';

export default function BoardConnectionEditor({ connection, needsReview, onSave, onDelete, onClose }: {
  connection: BoardConnection;
  needsReview: boolean;
  onSave: (patch: Partial<BoardConnection>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<BoardConnection['transportMode']>(connection.transportMode);
  const [minutes, setMinutes] = useState(connection.durationMinutes?.toString() ?? '');
  const [description, setDescription] = useState(connection.description ?? connection.label ?? '');
  const [error, setError] = useState('');
  const save = () => {
    const duration = minutes.trim() === '' ? undefined : Number(minutes);
    if (duration !== undefined && (!Number.isInteger(duration) || duration < 0 || duration > 10080)) {
      setError('이동시간은 0~10080분으로 입력해주세요.'); return;
    }
    onSave({ transportMode: mode, durationMinutes: duration,
      description: description.trim(), label: '', durationSource: 'manual' });
    onClose();
  };
  return <div role="dialog" aria-label="동선 수정" className="absolute z-30 w-[230px] -translate-x-1/2 rounded-xl border border-teal bg-white p-3 shadow-lg print:hidden"
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <strong className="block mb-2 text-xs text-teal-deep">동선 수정</strong>
    {needsReview && <p className="m-0 mb-2 text-xs text-[#91532B]">현재 날짜별 방문 순서와 선 방향이 맞지 않습니다. 연결한 장소를 확인해주세요.</p>}
    <label className="block mb-2 text-xs text-ink-soft">이동수단<select value={mode ?? ''} onChange={(event) => setMode(event.target.value ? event.target.value as BoardConnection['transportMode'] : undefined)} className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"><option value="">선택 안 함</option><option value="walk">도보</option><option value="transit">대중교통</option><option value="car">자동차</option><option value="other">기타</option></select></label>
    <label className="block mb-2 text-xs text-ink-soft">이동시간 (분)<input type="number" min={0} max={10080} value={minutes} onChange={(event) => setMinutes(event.target.value)} className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs" /></label>
    <label className="block mb-2 text-xs text-ink-soft">설명 (선택)<input maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs" /></label>
    <p className="m-0 mb-2 text-[10px] text-muted">출처: {connection.durationSource === 'manual' ? '직접 입력' : connection.durationSource === 'route_api' ? '경로 API' : '기존 정보 · 출처 미확인'} · 수정하면 직접 입력으로 저장됩니다.</p>
    {error && <p role="alert" className="m-0 mb-2 text-xs text-pin">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onDelete} className="mr-auto text-xs text-pin border-none bg-transparent cursor-pointer">선 삭제</button><button type="button" onClick={onClose} className="text-xs text-muted border-none bg-transparent cursor-pointer">취소</button><button type="button" onClick={save} className="rounded-lg bg-teal-deep px-2 py-1 text-xs text-white border-none cursor-pointer">적용</button></div>
  </div>;
}
