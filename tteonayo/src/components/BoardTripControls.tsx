import { useState } from 'react';
import { useTrip } from '../context/TripContext';
import type { TripMeta } from '../types';

type Field = 'region' | 'startDate' | 'endDate' | 'partySize' | 'totalBudget';
const labels: Record<Field, string> = {
  region: '여행 지역', startDate: '시작일', endDate: '종료일', partySize: '일행 수', totalBudget: '전체 예산',
};

export default function BoardTripControls() {
  const { tripMeta, updateTripMeta, tripPlaces } = useTrip();
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [budgetOpen, setBudgetOpen] = useState(false);
  const scheduled = tripPlaces.filter((item) => item.status === 'scheduled');
  const missingCosts = scheduled.filter((item) => item.cost == null).length;
  const total = scheduled.reduce((sum, item) => sum + (item.cost ?? 0) *
    (item.costBasis === 'per_person' ? tripMeta.partySize : 1), 0);

  const display = (field: Field) => {
    switch (field) {
      case 'region': return tripMeta.region || '지역 입력';
      case 'startDate': return tripMeta.startDate || '날짜 선택';
      case 'endDate': return tripMeta.endDate || '날짜 선택';
      case 'partySize': return `${tripMeta.partySize}명`;
      case 'totalBudget': return tripMeta.totalBudget == null ? '예산 입력' : `${tripMeta.totalBudget.toLocaleString('ko-KR')}원`;
    }
  };
  const begin = (field: Field) => {
    setEditing(field);
    setDraft(String(tripMeta[field] ?? ''));
    setError('');
  };
  const cancel = () => { setEditing(null); setError(''); };
  const save = () => {
    if (!editing) return;
    let patch: Partial<TripMeta>;
    if (editing === 'region') {
      if (draft.length > 80) { setError('지역은 80자 이내로 입력해주세요.'); return; }
      patch = { region: draft.trim() };
    } else if (editing === 'partySize') {
      const value = Number(draft);
      if (!draft.trim() || !Number.isInteger(value) || value < 1 || value > 50) {
        setError('일행 수는 1~50명으로 입력해주세요.'); return;
      }
      patch = { partySize: value };
    } else if (editing === 'totalBudget') {
      const value = Number(draft);
      if (draft.trim() && (!Number.isInteger(value) || value < 0 || value > 1000000000)) {
        setError('전체 예산은 0~10억 원으로 입력해주세요.'); return;
      }
      patch = { totalBudget: draft.trim() ? value : null };
    } else {
      const value = draft || undefined;
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { setError('날짜를 확인해주세요.'); return; }
      const startDate = editing === 'startDate' ? value : tripMeta.startDate;
      const endDate = editing === 'endDate' ? value : tripMeta.endDate;
      if (startDate && endDate && startDate > endDate) { setError('종료일은 시작일 이후여야 합니다.'); return; }
      if (scheduled.some((item) => item.visitDate &&
        ((startDate && item.visitDate < startDate) || (endDate && item.visitDate > endDate)))) {
        setError('기존 일정의 방문 날짜가 여행 기간 밖에 있습니다.'); return;
      }
      patch = { [editing]: value };
    }
    updateTripMeta(patch);
    cancel();
  };
  const input = (field: Field) => <div className="flex flex-wrap items-center gap-1">
    <input autoFocus aria-label={labels[field]}
      type={field === 'startDate' || field === 'endDate' ? 'date' : field === 'partySize' || field === 'totalBudget' ? 'number' : 'text'}
      min={field === 'partySize' ? 1 : field === 'totalBudget' ? 0 : field === 'endDate' ? tripMeta.startDate : undefined}
      max={field === 'partySize' ? 50 : field === 'totalBudget' ? 1000000000 : field === 'startDate' ? tripMeta.endDate : undefined}
      maxLength={field === 'region' ? 80 : undefined}
      value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }}
      onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') cancel(); }}
      className="min-w-0 w-[130px] max-w-full rounded border border-line bg-white px-1.5 py-0.5 text-sm text-ink outline-teal" />
    <button type="button" onClick={save} className="rounded px-1.5 py-0.5 text-xs font-semibold text-teal-deep cursor-pointer">저장</button>
    <button type="button" onClick={cancel} className="rounded px-1.5 py-0.5 text-xs text-muted cursor-pointer">취소</button>
  </div>;
  const overBudget = tripMeta.totalBudget != null && total > tripMeta.totalBudget;
  // 라벨과 값을 한 줄에 붙여, 큰 칸 여러 개 대신 요약 한 줄로 읽히게 한다.
  const setting = (field: Exclude<Field, 'totalBudget'>) => <div key={field}
    className="flex min-w-0 items-baseline gap-2 border-r border-line px-3 py-1">
    <span className="shrink-0 text-xs text-muted">{labels[field]}</span>
    {editing === field ? input(field) : <button type="button" onClick={() => begin(field)} title={`${labels[field]} 수정`}
      className="max-w-full truncate border-none bg-transparent p-0 text-left text-sm font-semibold text-ink cursor-pointer hover:text-teal hover:underline focus-visible:underline">
      {display(field)}
    </button>}
    {editing === field && error && <div role="alert" className="mt-1 text-xs text-pin">{error}</div>}
  </div>;

  return <div className="mb-3 print:hidden">
    <section aria-label="여행 설정"
      className="flex min-w-0 max-w-[1600px] flex-wrap items-center gap-y-1 rounded-xl border border-line bg-white px-1 py-1.5">
      {setting('region')}{setting('startDate')}{setting('endDate')}{setting('partySize')}
      <div className="flex min-w-0 flex-wrap items-baseline gap-2 px-3 py-1 text-teal-deep sm:ml-auto">
        <button type="button" onClick={() => setBudgetOpen((value) => !value)} aria-expanded={budgetOpen}
          className="flex items-baseline gap-2 border-none bg-transparent p-0 text-teal-deep cursor-pointer" title="예산 상세 보기">
          <span className="text-xs text-muted">입력된 비용</span>
          <strong className={`font-mono text-lg leading-none tabular-nums ${overBudget ? 'text-pin' : ''}`}>{total.toLocaleString('ko-KR')}원</strong>
        </button>
        <span className="text-xs text-muted">/ 예산</span>
        {editing === 'totalBudget' ? input('totalBudget') : <button type="button" onClick={() => begin('totalBudget')} title="전체 예산 수정"
          className="border-none bg-transparent p-0 text-sm font-semibold text-ink cursor-pointer hover:text-teal hover:underline focus-visible:underline">{display('totalBudget')}</button>}
        {overBudget && <span className="text-xs font-semibold text-pin">예산 초과</span>}
      </div>
    </section>
    {editing === 'totalBudget' && error && <div role="alert" className="mt-1 text-xs text-pin">{error}</div>}
    {budgetOpen && <section aria-label="예산 상세" className="mt-2 max-w-[420px] rounded-xl border border-line bg-white p-3 text-xs text-ink-soft">
      <div>확정 일정 {scheduled.length}곳 · 입력된 비용 합계 {total.toLocaleString('ko-KR')}원</div>
      {missingCosts > 0 && <div className="mt-1">비용 미입력 {missingCosts}곳은 합계에 포함되지 않았습니다.</div>}
      {tripMeta.totalBudget != null && <div className="mt-1">전체 예산 {tripMeta.totalBudget.toLocaleString('ko-KR')}원</div>}
      {scheduled.length > 0 && <div className="mt-1">입력 비용 기준 1인당 평균 예상 {Math.round(total / tripMeta.partySize).toLocaleString('ko-KR')}원 · 개인별 정산 금액은 아닙니다.</div>}
    </section>}
  </div>;
}
