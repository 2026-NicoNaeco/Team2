import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  places as seedPlaces,
  boardCards as seedBoardCards,
  boardConnections as seedConnections,
  diaryFolders as seedFolders,
} from '../data/mockData';
import type { BoardCard, BoardConnection, DiaryFolder, Place } from '../types';

// 지도 · AI채팅 · 일정판 · 기록함이 공유하는 여행 데이터.
// 기획서의 "기록 → AI 분석 → 다음 여행 계획" 흐름을 위해 한 곳에서 관리하고,
// localStorage에 저장해 새로고침해도 유지된다. (실제 서비스에서는 백엔드 API로 교체)

interface TripContextValue {
  places: Place[];
  updatePlacePosition: (id: string, lat: number, lng: number) => void;
  renamePlace: (id: string, name: string) => void;

  savedIds: string[];
  toggleSaved: (id: string) => void;
  isSaved: (id: string) => boolean;

  memos: Record<string, string>;
  setMemo: (id: string, text: string) => void;

  boardCards: BoardCard[];
  addBoardCard: (card: Omit<BoardCard, 'id' | 'top' | 'left'>) => boolean;
  moveBoardCard: (id: string, top: number, left: number) => void;
  updateBoardCard: (id: string, patch: Partial<BoardCard>) => void;
  removeBoardCard: (id: string) => void;
  addBlankBoardCard: (preset?: Partial<BoardCard>) => void;

  connections: BoardConnection[];
  addConnection: (from: string, to: string) => void;
  removeConnection: (id: string) => void;

  diaryFolders: DiaryFolder[];
  addDiaryFolder: (name: string) => void;
  renameDiaryFolder: (id: string, name: string) => void;
  removeDiaryFolder: (id: string) => void;

  activityLog: string[];
  logActivity: (msg: string) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

// 시드 데이터(장소·일정판 카드 등)가 바뀌면 SCHEMA 숫자를 올린다.
// 그러면 예전에 저장된 상태를 버리고 새 시드로 다시 시작한다.
const SCHEMA = 4;
const LS_KEY = `tteonayo:trip:v${SCHEMA}`;

interface Persisted {
  positions?: Record<string, { lat: number; lng: number }>;
  names?: Record<string, string>;
  savedIds?: string[];
  memos?: Record<string, string>;
  boardCards?: BoardCard[];
  connections?: BoardConnection[];
  diaryFolders?: DiaryFolder[];
}

function loadPersisted(): Persisted {
  try {
    // 구버전 스키마 키 정리
    for (let v = 1; v < SCHEMA; v++) localStorage.removeItem(`tteonayo:trip:v${v}`);
    localStorage.removeItem('tteonayo:trip');
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

// 로그아웃 시 호출 — 다음 사용자가 이전 사용자의 지도/일정판 데이터를 보지 않도록 정리
export function clearPersistedTrip() {
  try {
    for (let v = 1; v <= SCHEMA; v++) localStorage.removeItem(`tteonayo:trip:v${v}`);
    localStorage.removeItem('tteonayo:trip');
  } catch {
    /* 무시 */
  }
}

export function TripProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersisted(), []);

  const [places, setPlaces] = useState<Place[]>(() =>
    seedPlaces.map((p) => {
      const pos = persisted.positions?.[p.id];
      const name = persisted.names?.[p.id] ?? p.name;
      return { ...p, name, ...(pos ? { lat: pos.lat, lng: pos.lng } : null) };
    })
  );
  const [savedIds, setSavedIds] = useState<string[]>(
    persisted.savedIds ?? ['suncheonman-garden', 'ocheon-cafe-street']
  );
  const [memos, setMemos] = useState<Record<string, string>>(persisted.memos ?? {});
  const [boardCards, setBoardCards] = useState<BoardCard[]>(persisted.boardCards ?? seedBoardCards);
  const [connections, setConnections] = useState<BoardConnection[]>(
    persisted.connections ?? seedConnections
  );
  const [diaryFolders, setDiaryFolders] = useState<DiaryFolder[]>(
    persisted.diaryFolders ?? seedFolders
  );
  const [activityLog, setActivityLog] = useState<string[]>([
    '장소 카드 이동',
    '메모 업데이트',
    '코스 추가',
  ]);

  // 변경사항 저장 (드래그 중 매 프레임 저장되지 않도록 디바운스)
  useEffect(() => {
    const t = setTimeout(() => {
      const positions: Record<string, { lat: number; lng: number }> = {};
      const names: Record<string, string> = {};
      for (const p of places) {
        positions[p.id] = { lat: p.lat, lng: p.lng };
        names[p.id] = p.name;
      }
      const data: Persisted = {
        positions,
        names,
        savedIds,
        memos,
        boardCards,
        connections,
        diaryFolders,
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch {
        /* 저장 공간이 없거나 비공개 모드 — 무시 */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [places, savedIds, memos, boardCards, connections, diaryFolders]);

  const logActivity = (msg: string) => setActivityLog((prev) => [msg, ...prev].slice(0, 6));

  const value: TripContextValue = {
    places,
    updatePlacePosition: (id, lat, lng) =>
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, lat, lng } : p))),
    renamePlace: (id, name) => {
      const t = name.trim();
      if (!t) return;
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, name: t } : p)));
    },

    savedIds,
    isSaved: (id) => savedIds.includes(id),
    toggleSaved: (id) =>
      setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),

    memos,
    setMemo: (id, text) => setMemos((prev) => ({ ...prev, [id]: text })),

    boardCards,
    addBoardCard: (card) => {
      // 이미 담긴 장소는 중복 추가하지 않음
      const dup = boardCards.some((c) => c.title === card.title);
      if (dup) return false;
      const n = boardCards.length;
      setBoardCards((prev) => [
        ...prev,
        { ...card, id: crypto.randomUUID(), top: 40 + (n % 4) * 24, left: 40 + n * 60 },
      ]);
      logActivity(`코스 추가 · ${card.title}`);
      return true;
    },
    addBlankBoardCard: (preset) => {
      const n = boardCards.length;
      setBoardCards((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          day: '새 일정',
          time: '',
          title: '새 카드',
          description: '',
          top: 40 + (n % 5) * 22,
          left: 40 + (n % 6) * 56,
          ...preset,
        },
      ]);
      logActivity(
        preset?.imageUrl ? '사진 추가' : preset?.title ? `카드 추가 · ${preset.title}` : '카드 추가'
      );
    },
    moveBoardCard: (id, top, left) =>
      setBoardCards((prev) => prev.map((c) => (c.id === id ? { ...c, top, left } : c))),
    updateBoardCard: (id, patch) =>
      setBoardCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    removeBoardCard: (id) => {
      setBoardCards((prev) => prev.filter((c) => c.id !== id));
      // 사라진 카드에 걸린 연결선도 정리
      setConnections((prev) => prev.filter((cn) => cn.from !== id && cn.to !== id));
      logActivity('카드 삭제');
    },

    connections,
    addConnection: (from, to) => {
      if (from === to) return;
      setConnections((prev) => {
        const exists = prev.some(
          (c) => (c.from === from && c.to === to) || (c.from === to && c.to === from)
        );
        if (exists) return prev;
        return [...prev, { id: crypto.randomUUID(), from, to }];
      });
      logActivity('동선 연결');
    },
    removeConnection: (id) => {
      setConnections((prev) => prev.filter((c) => c.id !== id));
      logActivity('동선 연결 해제');
    },

    diaryFolders,
    addDiaryFolder: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setDiaryFolders((prev) => [...prev, { id: crypto.randomUUID(), name: trimmed }]);
    },
    renameDiaryFolder: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setDiaryFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
    },
    removeDiaryFolder: (id) =>
      setDiaryFolders((prev) => (prev.length <= 1 ? prev : prev.filter((f) => f.id !== id))),

    activityLog,
    logActivity,
  };

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip은 TripProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
