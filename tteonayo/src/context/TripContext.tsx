import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  places as seedPlaces,
  diaryFolders as seedFolders,
} from '../data/mockData';
import type { BoardCard, BoardConnection, DiaryFolder, DiaryNote, Place, SavedBoard } from '../types';
import { useAuth } from './AuthContext';

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

  savedBoards: SavedBoard[];
  activeBoardId: string | null;
  hasUnsavedBoardChanges: boolean;
  saveBoard: (title: string) => string;
  openBoard: (id: string) => boolean;
  createBoard: () => void;
  deleteBoard: (id: string) => void;

  diaryFolders: DiaryFolder[];
  diaryNotes: DiaryNote[];
  addDiaryFolder: (name: string) => void;
  renameDiaryFolder: (id: string, name: string) => void;
  removeDiaryFolder: (id: string) => void;
  addDiaryNote: (folderId: string) => string;
  updateDiaryNote: (id: string, title: string, content: string) => void;
  removeDiaryNote: (id: string) => void;

  activityLog: string[];
  logActivity: (msg: string) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

const SCHEMA = 4;
const legacyKeys = Array.from({ length: SCHEMA }, (_, index) => `tteonayo:trip:v${SCHEMA - index}`).concat('tteonayo:trip');
const storageKey = (userId: number) => `tteonayo:trip:user:${userId}:v${SCHEMA}`;

interface Persisted {
  positions?: Record<string, { lat: number; lng: number }>;
  names?: Record<string, string>;
  savedIds?: string[];
  memos?: Record<string, string>;
  boardCards?: BoardCard[];
  connections?: BoardConnection[];
  diaryFolders?: DiaryFolder[];
  diaryNotes?: DiaryNote[];
  savedBoards?: SavedBoard[];
  activeBoardId?: string | null;
}

function loadPersisted(userId: number): Persisted {
  try {
    const key = storageKey(userId);
    const current = localStorage.getItem(key);
    const legacyKey = !current ? legacyKeys.find((candidate) => localStorage.getItem(candidate)) : undefined;
    const data = JSON.parse(current ?? (legacyKey ? localStorage.getItem(legacyKey) : null) ?? '{}') as Persisted;
    // 이전 메모장 버전에서 작성한 내용을 일정판의 메모 카드로 옮긴다.
    if (!data.savedBoards && data.diaryNotes?.length) {
      const folders = data.diaryFolders ?? seedFolders;
      data.savedBoards = folders.flatMap((folder) => {
        const notes = data.diaryNotes?.filter((note) => note.folderId === folder.id) ?? [];
        if (!notes.length) return [];
        const now = new Date().toISOString();
        return [{
          id: crypto.randomUUID(),
          title: folder.name,
          cards: notes.map((note, index) => ({
            id: note.id, day: '메모', icon: '📝', title: note.title,
            description: note.content, top: 40 + Math.floor(index / 3) * 190,
            left: 40 + (index % 3) * 260,
          })),
          connections: [], createdAt: now, updatedAt: now,
        }];
      });
    }
    if (legacyKey) {
      localStorage.setItem(key, JSON.stringify(data));
      for (const oldKey of legacyKeys) localStorage.removeItem(oldKey);
    }
    return data;
  } catch {
    return {};
  }
}

function persistBoardList(key: string, boards: SavedBoard[], activeId: string | null) {
  const current = JSON.parse(localStorage.getItem(key) || '{}') as Persisted;
  localStorage.setItem(key, JSON.stringify({
    ...current, savedBoards: boards, activeBoardId: activeId,
  }));
}

export function TripProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) throw new Error('여행 데이터는 로그인 후 이용할 수 있어요.');
  const key = storageKey(user.id);
  const persisted = useMemo(() => loadPersisted(user.id), [user.id]);

  const [places, setPlaces] = useState<Place[]>(() =>
    seedPlaces.map((p) => {
      const pos = persisted.positions?.[p.id];
      const name = persisted.names?.[p.id] ?? p.name;
      return { ...p, name, ...(pos ? { lat: pos.lat, lng: pos.lng } : null) };
    })
  );
  const [savedIds, setSavedIds] = useState<string[]>(persisted.savedIds ?? []);
  const [memos, setMemos] = useState<Record<string, string>>(persisted.memos ?? {});
  const [boardCards, setBoardCards] = useState<BoardCard[]>(persisted.boardCards ?? []);
  const [connections, setConnections] = useState<BoardConnection[]>(persisted.connections ?? []);
  const [savedBoards, setSavedBoards] = useState<SavedBoard[]>(persisted.savedBoards ?? []);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(persisted.activeBoardId ?? null);
  const [diaryFolders, setDiaryFolders] = useState<DiaryFolder[]>(
    persisted.diaryFolders ?? seedFolders
  );
  const [diaryNotes, setDiaryNotes] = useState<DiaryNote[]>(persisted.diaryNotes ?? []);
  const [activityLog, setActivityLog] = useState<string[]>([]);

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
        diaryNotes,
        savedBoards,
        activeBoardId,
      };
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        /* 저장 공간이 없거나 비공개 모드 — 무시 */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [key, places, savedIds, memos, boardCards, connections, diaryFolders, diaryNotes, savedBoards, activeBoardId]);

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
      const dup = boardCards.some((c) => card.placeId ? c.placeId === card.placeId : c.title === card.title);
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

    savedBoards,
    activeBoardId,
    hasUnsavedBoardChanges: (() => {
      const current = savedBoards.find((board) => board.id === activeBoardId);
      return current
        ? JSON.stringify(boardCards) !== JSON.stringify(current.cards) ||
            JSON.stringify(connections) !== JSON.stringify(current.connections)
        : boardCards.length > 0 || connections.length > 0;
    })(),
    saveBoard: (title) => {
      const cleanTitle = title.trim();
      if (!cleanTitle || cleanTitle.length > 80) throw new Error('일정판 이름은 1~80자로 입력해주세요.');
      const now = new Date().toISOString();
      const id = activeBoardId ?? crypto.randomUUID();
      const previous = savedBoards.find((board) => board.id === id);
      const board: SavedBoard = {
        id, title: cleanTitle,
        cards: boardCards.map((card) => ({ ...card })),
        connections: connections.map((connection) => ({ ...connection })),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      const next = previous
        ? savedBoards.map((item) => item.id === id ? board : item)
        : [board, ...savedBoards];
      persistBoardList(key, next, id);
      setSavedBoards(next);
      setActiveBoardId(id);
      return id;
    },
    openBoard: (id) => {
      const board = savedBoards.find((item) => item.id === id);
      if (!board) return false;
      setBoardCards(board.cards.map((card) => ({ ...card })));
      setConnections(board.connections.map((connection) => ({ ...connection })));
      setActiveBoardId(id);
      return true;
    },
    createBoard: () => {
      setBoardCards([]);
      setConnections([]);
      setActiveBoardId(null);
    },
    deleteBoard: (id) => {
      const next = savedBoards.filter((item) => item.id !== id);
      const nextActiveId = activeBoardId === id ? null : activeBoardId;
      persistBoardList(key, next, nextActiveId);
      setSavedBoards(next);
      if (activeBoardId === id) {
        setBoardCards([]);
        setConnections([]);
        setActiveBoardId(null);
      }
    },

    diaryFolders,
    diaryNotes,
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
    removeDiaryFolder: (id) => {
      if (diaryFolders.length <= 1) return;
      setDiaryFolders((prev) => prev.filter((f) => f.id !== id));
      setDiaryNotes((prev) => prev.filter((note) => note.folderId !== id));
    },
    addDiaryNote: (folderId) => {
      const id = crypto.randomUUID();
      setDiaryNotes((prev) => [
        { id, folderId, title: '새 메모', content: '', updatedAt: new Date().toISOString() },
        ...prev,
      ]);
      return id;
    },
    updateDiaryNote: (id, title, content) =>
      setDiaryNotes((prev) => prev.map((note) =>
        note.id === id ? { ...note, title: title.trim(), content, updatedAt: new Date().toISOString() } : note
      )),
    removeDiaryNote: (id) => setDiaryNotes((prev) => prev.filter((note) => note.id !== id)),

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
