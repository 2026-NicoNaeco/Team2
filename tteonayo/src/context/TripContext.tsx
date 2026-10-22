import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  places as seedPlaces,
  diaryFolders as seedFolders,
} from '../data/mockData';
import type { BoardCard, BoardConnection, ChatConversation, DiaryFolder, DiaryNote, Place, SavedBoard, TripMeta, TripPlace } from '../types';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../services/apiBase';
import { useLocation } from 'react-router-dom';
import type { BoardApiBoard } from '../types';

// 지도 · AI채팅 · 일정판 · 기록함이 공유하는 여행 데이터.
// 기획서의 "기록 → AI 분석 → 다음 여행 계획" 흐름을 위해 한 곳에서 관리하고,
// 로그인한 사용자의 서버 데이터와 동기화하고 브라우저에도 복구용 사본을 둔다.

interface TripContextValue {
  syncError: string;
  syncStatus: 'loading' | 'synced' | 'pending' | 'saving' | 'error';
  retrySync: () => void;
  places: Place[];
  addPlace: (place: Omit<Place, 'id'>) => Place;
  updatePlacePosition: (id: string, lat: number, lng: number) => void;
  renamePlace: (id: string, name: string) => void;
  removePlace: (id: string) => void;

  savedIds: string[];

  memos: Record<string, string>;
  setMemo: (id: string, text: string) => void;

  boardCards: BoardCard[];
  addBoardCard: (card: Omit<BoardCard, 'id' | 'top' | 'left'>) => boolean;
  moveBoardCard: (id: string, top: number, left: number) => void;
  updateBoardCard: (id: string, patch: Partial<BoardCard>) => void;
  removeBoardCard: (id: string) => void;
  addBlankBoardCard: (preset?: Partial<BoardCard>) => string;

  connections: BoardConnection[];
  addConnection: (from: string, to: string) => void;
  updateConnection: (id: string, patch: Partial<BoardConnection>) => void;
  removeConnection: (id: string) => void;

  savedBoards: SavedBoard[];
  activeBoardId: string | null;
  tripMeta: TripMeta;
  updateTripMeta: (patch: Partial<TripMeta>) => void;
  tripPlaces: TripPlace[];
  updateTripPlace: (id: string, patch: Partial<TripPlace>) => void;
  reorderTripPlaces: (visitDate: string, sourceId: string, targetId: string) => void;
  hasUnsavedBoardChanges: boolean;
  saveBoard: (title: string) => string;
  openBoard: (id: string) => boolean;
  createBoard: () => void;
  deleteBoard: (id: string) => void;
  apiWorkspaceBoardId: string | null;
  loadApiBoard: (board: BoardApiBoard) => void;
  adoptCreatedBoard: (id: string) => void;
  restoreBoardDraft: () => void;

  diaryFolders: DiaryFolder[];
  diaryNotes: DiaryNote[];
  addDiaryFolder: (name: string) => void;
  renameDiaryFolder: (id: string, name: string) => void;
  removeDiaryFolder: (id: string) => void;
  addDiaryNote: (folderId: string) => string;
  updateDiaryNote: (id: string, title: string, content: string) => void;
  removeDiaryNote: (id: string) => void;

  chatConversations: ChatConversation[];
  setChatConversations: Dispatch<SetStateAction<ChatConversation[]>>;

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
  customPlaces?: Place[];
  deletedPlaceIds?: string[];
  savedIds?: string[];
  memos?: Record<string, string>;
  boardCards?: BoardCard[];
  connections?: BoardConnection[];
  diaryFolders?: DiaryFolder[];
  diaryNotes?: DiaryNote[];
  savedBoards?: SavedBoard[];
  activeBoardId?: string | null;
  activeTripMeta?: TripMeta;
  activeTripPlaces?: TripPlace[];
  chatConversations?: ChatConversation[];
}

// PostgreSQL jsonb는 객체의 키 순서를 바꿀 수 있다. 동기화 비교에서는 키 순서를 무시한다.
function stableStringify(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonical(nested)]));
    }
    return item;
  };
  return JSON.stringify(canonical(value));
}

function storedFingerprint(raw: string | null): string | null {
  if (!raw) return null;
  try { return stableStringify(JSON.parse(raw)); } catch { return raw; }
}

const emptyTripMeta = (): TripMeta => ({ region: '', partySize: 1, totalBudget: null });

function placesFromLegacyCards(cards: BoardCard[], places: Place[]): TripPlace[] {
  return cards.filter((card) => card.placeId).map((card) => {
    const place = places.find((item) => item.id === card.placeId);
    return {
      id: `legacy-${card.id}`, placeId: card.placeId!, status: 'unassigned' as const,
      origin: 'saved' as const,
      snapshot: { name: card.title, address: card.address ?? place?.address,
        lat: place?.lat, lng: place?.lng },
    };
  });
}

interface ServerState { version: number; data: Persisted | null }

async function travelRequest(path: string, method = 'GET', body?: object): Promise<ServerState> {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('다시 로그인해 주세요.');
  const response = await fetch(`${API_BASE_URL}/api/travel/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as ServerState & { error?: string };
  if (!response.ok) throw new Error(payload.error || '여행 데이터를 불러오지 못했습니다.');
  return payload;
}

function loadPersisted(userId: number): Persisted {
  try {
    const key = storageKey(userId);
    const current = localStorage.getItem(key);
    const legacyKey = !current ? legacyKeys.find((candidate) => localStorage.getItem(candidate)) : undefined;
    const data = JSON.parse(current ?? (legacyKey ? localStorage.getItem(legacyKey) : null) ?? '{}') as Persisted;
    if (!data.chatConversations) {
      try {
        const chats = JSON.parse(localStorage.getItem(`tteonayo:chat:${userId}`) ?? '[]') as unknown;
        if (Array.isArray(chats) && chats.length) data.chatConversations = chats.filter((item): item is ChatConversation =>
          item !== null && typeof item === 'object' &&
          typeof item.id === 'string' && typeof item.region === 'string' &&
          typeof item.title === 'string' && Array.isArray(item.messages) &&
          typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
        );
      } catch { /* 기존 여행 데이터는 계속 읽는다 */ }
    }
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
            id: note.id, day: '메모', title: note.title,
            description: note.content, top: 40 + Math.floor(index / 3) * 190,
            left: 40 + (index % 3) * 260,
          })),
          connections: [], createdAt: now, updatedAt: now,
        }];
      });
    }
    if (legacyKey || (current && data.savedBoards && !JSON.parse(current).savedBoards)) {
      localStorage.setItem(key, JSON.stringify(data));
    }
    return data;
  } catch {
    return {};
  }
}

function persistBoardList(key: string, boards: SavedBoard[], activeId: string | null) {
  try {
    const current = JSON.parse(localStorage.getItem(key) || '{}') as Persisted;
    localStorage.setItem(key, JSON.stringify({
      ...current, savedBoards: boards, activeBoardId: activeId,
    }));
    return true;
  } catch {
    return false;
  }
}

export function TripProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) throw new Error('여행 데이터는 로그인 후 이용할 수 있어요.');
  const key = storageKey(user.id);
  const syncHashKey = `${key}:server-copy`;
  const syncVersionKey = `${key}:server-version`;
  const persisted = useMemo(() => loadPersisted(user.id), [user.id]);

  const [places, setPlaces] = useState<Place[]>(() =>
    seedPlaces.filter((p) => !persisted.deletedPlaceIds?.includes(p.id)).map((p) => {
      const pos = persisted.positions?.[p.id];
      const name = persisted.names?.[p.id] ?? p.name;
      return { ...p, name, ...(pos ? { lat: pos.lat, lng: pos.lng } : null) };
    }).concat((persisted.customPlaces ?? []).filter((p) => !persisted.deletedPlaceIds?.includes(p.id)))
  );
  const [deletedPlaceIds, setDeletedPlaceIds] = useState<string[]>(persisted.deletedPlaceIds ?? []);
  const [savedIds, setSavedIds] = useState<string[]>(persisted.savedIds ?? []);
  const [memos, setMemos] = useState<Record<string, string>>(persisted.memos ?? {});
  const [boardCards, setBoardCards] = useState<BoardCard[]>(persisted.boardCards ?? []);
  const [connections, setConnections] = useState<BoardConnection[]>(persisted.connections ?? []);
  const [savedBoards, setSavedBoards] = useState<SavedBoard[]>(persisted.savedBoards ?? []);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(persisted.activeBoardId ?? null);
  const [apiWorkspaceBoardId, setApiWorkspaceBoardId] = useState<string | null>(null);
  const [tripMeta, setTripMeta] = useState<TripMeta>(persisted.activeTripMeta ?? emptyTripMeta());
  const [tripPlaces, setTripPlaces] = useState<TripPlace[]>(persisted.activeTripPlaces ??
    placesFromLegacyCards(persisted.boardCards ?? [], places));
  const boardDraft = useRef({
    cards: persisted.boardCards ?? [] as BoardCard[],
    connections: persisted.connections ?? [] as BoardConnection[],
    tripMeta: persisted.activeTripMeta ?? emptyTripMeta(),
    tripPlaces: persisted.activeTripPlaces ?? placesFromLegacyCards(persisted.boardCards ?? [], places),
    activeBoardId: persisted.activeBoardId ?? null,
  });
  const [diaryFolders, setDiaryFolders] = useState<DiaryFolder[]>(
    persisted.diaryFolders ?? seedFolders
  );
  const [diaryNotes, setDiaryNotes] = useState<DiaryNote[]>(persisted.diaryNotes ?? []);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>(persisted.chatConversations ?? []);
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [serverReady, setServerReady] = useState(false);
  const [bootError, setBootError] = useState('');
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncError, setSyncError] = useState('');
  const [syncStatus, setSyncStatus] = useState<'loading' | 'synced' | 'pending' | 'saving' | 'error'>('loading');
  const serverVersion = useRef(0);
  const lastSynced = useRef('');
  const pending = useRef<Persisted | null>(null);
  const sending = useRef(false);
  const blocked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const localData = persisted;
        const localJson = stableStringify(localData);
        const hasLocalData = Object.keys(localData).length > 0;
        const remote = await travelRequest('state');
        if (cancelled) return;
        let result = remote;
        if (remote.data && hasLocalData && stableStringify(remote.data) !== localJson) {
          const knownCopy = storedFingerprint(localStorage.getItem(syncHashKey));
          if (knownCopy !== localJson) {
            if (knownCopy === stableStringify(remote.data) && Number(localStorage.getItem(syncVersionKey)) === remote.version) {
              result = await travelRequest('state', 'PUT', { version: remote.version, data: localData });
              if (cancelled) return;
            } else {
              throw new Error('이 브라우저와 서버의 여행 데이터가 다릅니다. 자동으로 덮어쓰지 않았어요. 브라우저 원본을 보존한 채 데이터를 확인해주세요.');
            }
          }
        }
        if (!remote.data && hasLocalData) {
          const importKey = `${key}:import-id`;
          let importId = localStorage.getItem(importKey);
          if (!importId) {
            importId = crypto.randomUUID();
            localStorage.setItem(importKey, importId);
          }
          result = await travelRequest('import', 'POST', { importId, data: localData });
          if (cancelled) return;
        }
        const data = result.data ?? localData;
        serverVersion.current = result.version;
        lastSynced.current = stableStringify(data);
        try {
          localStorage.setItem(syncHashKey, lastSynced.current);
          localStorage.setItem(syncVersionKey, String(result.version));
        } catch { /* 서버 원본은 읽었다 */ }
        const deleted = data.deletedPlaceIds ?? [];
        setPlaces(seedPlaces.filter((place) => !deleted.includes(place.id)).map((place) => {
          const position = data.positions?.[place.id];
          return { ...place, name: data.names?.[place.id] ?? place.name,
            ...(position ? { lat: position.lat, lng: position.lng } : {}) };
        }).concat((data.customPlaces ?? []).filter((place) => !deleted.includes(place.id))));
        setDeletedPlaceIds(deleted);
        setSavedIds(data.savedIds ?? []);
        setMemos(data.memos ?? {});
        setBoardCards(data.boardCards ?? []);
        setConnections(data.connections ?? []);
        setSavedBoards(data.savedBoards ?? []);
        setActiveBoardId(data.activeBoardId ?? null);
        setTripMeta(data.activeTripMeta ?? emptyTripMeta());
        setTripPlaces(data.activeTripPlaces ?? placesFromLegacyCards(data.boardCards ?? [],
          [...seedPlaces, ...(data.customPlaces ?? [])]));
        boardDraft.current = {
          cards: data.boardCards ?? [], connections: data.connections ?? [],
          tripMeta: data.activeTripMeta ?? emptyTripMeta(),
          tripPlaces: data.activeTripPlaces ?? placesFromLegacyCards(data.boardCards ?? [],
            [...seedPlaces, ...(data.customPlaces ?? [])]),
          activeBoardId: data.activeBoardId ?? null,
        };
        setDiaryFolders(data.diaryFolders ?? seedFolders);
        setDiaryNotes(data.diaryNotes ?? []);
        setChatConversations(data.chatConversations ?? []);
        setBootError('');
        setServerReady(true);
        setSyncStatus('synced');
      } catch (error) {
        if (!cancelled) setBootError(error instanceof Error ? error.message : '여행 데이터를 불러오지 못했습니다.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [key, persisted, syncHashKey, syncVersionKey, loadAttempt]);

  useEffect(() => {
    if (apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname)) return;
    boardDraft.current = { cards: boardCards, connections, tripMeta, tripPlaces, activeBoardId };
  }, [apiWorkspaceBoardId, location.pathname, boardCards, connections, tripMeta, tripPlaces, activeBoardId]);

  const flush = useCallback(async () => {
    if (sending.current || blocked.current || !pending.current) return;
    sending.current = true;
    try {
      while (pending.current && !blocked.current) {
        const data = pending.current;
        pending.current = null;
        setSyncStatus('saving');
        try {
          const result = await travelRequest('state', 'PUT', { version: serverVersion.current, data });
          serverVersion.current = result.version;
          lastSynced.current = stableStringify(data);
          let backupFailed = false;
          try {
            localStorage.setItem(syncHashKey, lastSynced.current);
            localStorage.setItem(syncVersionKey, String(result.version));
          } catch { backupFailed = true; }
          setSyncError(backupFailed ? '서버에는 저장됐지만 브라우저 백업은 저장하지 못했습니다.' : '');
          setSyncStatus(pending.current ? 'pending' : 'synced');
        } catch (error) {
          pending.current = pending.current ?? data;
          const message = error instanceof Error ? error.message : '서버 저장에 실패했습니다.';
          if (message.includes('다른 기기')) blocked.current = true;
          setSyncError(message);
          setSyncStatus('error');
          break;
        }
      }
    } finally {
      sending.current = false;
    }
  }, [syncHashKey, syncVersionKey]);

  // 변경사항 저장 (드래그 중 매 프레임 저장되지 않도록 디바운스)
  useEffect(() => {
    if (!serverReady) return;
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
        customPlaces: places.filter((place) => !seedPlaces.some((seed) => seed.id === place.id)),
        deletedPlaceIds,
        savedIds,
        memos,
        boardCards: apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname) ? boardDraft.current.cards : boardCards,
        connections: apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname) ? boardDraft.current.connections : connections,
        diaryFolders,
        diaryNotes,
        savedBoards,
        activeBoardId: apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname) ? boardDraft.current.activeBoardId : activeBoardId,
        activeTripMeta: apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname) ? boardDraft.current.tripMeta : tripMeta,
        activeTripPlaces: apiWorkspaceBoardId || /^\/board\/[^/]+$/.test(location.pathname) ? boardDraft.current.tripPlaces : tripPlaces,
        chatConversations,
      };
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        setSyncError('브라우저에 백업을 저장하지 못했습니다. 저장 공간을 확인해주세요.');
      }
      if (stableStringify(data) !== lastSynced.current) {
        pending.current = data;
        if (!blocked.current) {
          setSyncStatus('pending');
          void flush();
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [serverReady, key, places, deletedPlaceIds, savedIds, memos, boardCards, connections, diaryFolders, diaryNotes, savedBoards, activeBoardId, tripMeta, tripPlaces, chatConversations, flush, apiWorkspaceBoardId, location.pathname]);

  const logActivity = (msg: string) => setActivityLog((prev) => [msg, ...prev].slice(0, 6));

  const value: TripContextValue = {
    syncError,
    syncStatus,
    retrySync: () => { if (blocked.current) window.location.reload(); else void flush(); },
    places,
    addPlace: (input) => {
      const name = input.name.trim();
      const description = input.description.trim();
      const address = input.address?.trim();
      const existing = input.sourceId && places.find((place) => place.source === input.source && place.sourceId === input.sourceId);
      if (existing) return existing;
      if (!name || name.length > 80) throw new Error('장소 이름은 1~80자로 입력해주세요.');
      if (description.length > 300) throw new Error('장소 설명은 300자 이하로 입력해주세요.');
      if (address && address.length > 200) throw new Error('주소는 200자 이하로 입력해주세요.');
      if (!['카페', '관광지', '맛집', '숙소'].includes(input.category)) throw new Error('장소 분류를 선택해주세요.');
      if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
        throw new Error('지도에서 올바른 위치를 선택해주세요.');
      }
      if (input.tags.length > 5 || input.tags.some((tag) => tag.length > 20)) {
        throw new Error('태그는 5개까지, 각 20자 이하로 입력해주세요.');
      }
      const place: Place = { ...input, id: crypto.randomUUID(), name, description, address, tags: input.tags.map((tag) => tag.trim()).filter(Boolean) };
      setPlaces((prev) => [...prev, place]);
      setSavedIds((prev) => [...prev, place.id]);
      return place;
    },
    updatePlacePosition: (id, lat, lng) =>
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, lat, lng } : p))),
    renamePlace: (id, name) => {
      const t = name.trim();
      if (!t) return;
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, name: t } : p)));
    },
    removePlace: (id) => {
      setPlaces((prev) => prev.filter((place) => place.id !== id));
      setDeletedPlaceIds((prev) => prev.includes(id) ? prev : [...prev, id]);
      setSavedIds((prev) => prev.filter((savedId) => savedId !== id));
      setMemos((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },

    savedIds,

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
      if (card.placeId) {
        const place = places.find((item) => item.id === card.placeId);
        setTripPlaces((prev) => [...prev, {
          id: crypto.randomUUID(), placeId: card.placeId!, status: 'candidate', origin: 'saved',
          snapshot: { name: card.title, address: card.address ?? place?.address,
            lat: place?.lat, lng: place?.lng },
        }]);
      }
      logActivity(`코스 추가 · ${card.title}`);
      return true;
    },
    addBlankBoardCard: (preset) => {
      const n = boardCards.length;
      const id = crypto.randomUUID();
      setBoardCards((prev) => [
        ...prev,
        {
          id,
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
      return id;
    },
    moveBoardCard: (id, top, left) =>
      setBoardCards((prev) => prev.map((c) => (c.id === id ? { ...c, top, left } : c))),
    updateBoardCard: (id, patch) =>
      setBoardCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    removeBoardCard: (id) => {
      const removed = boardCards.find((card) => card.id === id);
      setBoardCards((prev) => prev.filter((c) => c.id !== id));
      if (removed?.placeId) setTripPlaces((prev) => prev.filter((item) => item.placeId !== removed.placeId));
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
    updateConnection: (id, patch) =>
      setConnections((prev) => prev.map((connection) =>
        connection.id === id ? { ...connection, ...patch } : connection
      )),
    removeConnection: (id) => {
      setConnections((prev) => prev.filter((c) => c.id !== id));
      logActivity('동선 연결 해제');
    },

    savedBoards,
    activeBoardId,
    tripMeta,
    updateTripMeta: (patch) => setTripMeta((previous) => ({ ...previous, ...patch })),
    tripPlaces,
    updateTripPlace: (id, patch) => setTripPlaces((previous) => previous.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    )),
    reorderTripPlaces: (visitDate, sourceId, targetId) => setTripPlaces((previous) => {
      const day = previous.filter((item) => item.status === 'scheduled' && item.visitDate === visitDate)
        .sort((a, b) => (a.visitOrder ?? 0) - (b.visitOrder ?? 0));
      const from = day.findIndex((item) => item.id === sourceId);
      const to = day.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0 || from === to) return previous;
      const [moved] = day.splice(from, 1);
      day.splice(to, 0, moved);
      const orders = new Map(day.map((item, index) => [item.id, index + 1]));
      return previous.map((item) => orders.has(item.id) ? { ...item, visitOrder: orders.get(item.id) } : item);
    }),
    hasUnsavedBoardChanges: (() => {
      const current = savedBoards.find((board) => board.id === activeBoardId);
      return current
        ? stableStringify(boardCards) !== stableStringify(current.cards) ||
            stableStringify(connections) !== stableStringify(current.connections) ||
            stableStringify(tripMeta) !== stableStringify(current.tripMeta ?? emptyTripMeta()) ||
            stableStringify(tripPlaces) !== stableStringify(current.tripPlaces ?? placesFromLegacyCards(current.cards, places))
        : boardCards.length > 0 || connections.length > 0 || tripPlaces.length > 0 ||
          stableStringify(tripMeta) !== stableStringify(emptyTripMeta());
    })(),
    saveBoard: (title) => {
      const cleanTitle = title.trim();
      if (!cleanTitle || cleanTitle.length > 80) throw new Error('일정판 이름은 1~80자로 입력해주세요.');
      if (!Number.isInteger(tripMeta.partySize) || tripMeta.partySize < 1 || tripMeta.partySize > 50) throw new Error('일행 수는 1~50명으로 입력해주세요.');
      if (tripMeta.region.length > 80 || (tripMeta.startDate && tripMeta.endDate && tripMeta.startDate > tripMeta.endDate)) throw new Error('여행 지역과 날짜를 확인해주세요.');
      if (tripMeta.totalBudget !== null && tripMeta.totalBudget !== undefined &&
          (!Number.isInteger(tripMeta.totalBudget) || tripMeta.totalBudget < 0 || tripMeta.totalBudget > 1000000000)) throw new Error('전체 예산은 0~10억 원으로 입력해주세요.');
      for (const item of tripPlaces) {
        if ([item.visitTime, item.reservationTime].some((time) => time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('방문 예정 시간과 예약 시간을 확인해주세요.');
        if (item.status === 'scheduled' && (!item.visitDate ||
            (tripMeta.startDate && item.visitDate < tripMeta.startDate) ||
            (tripMeta.endDate && item.visitDate > tripMeta.endDate))) throw new Error('확정 장소의 방문 날짜가 여행 기간 안에 있는지 확인해주세요.');
        if (item.cost !== undefined && item.cost !== null &&
            (!Number.isInteger(item.cost) || item.cost < 0 || item.cost > 1000000000)) throw new Error('예상 비용을 확인해주세요.');
        if (item.visitOrder !== undefined && (!Number.isInteger(item.visitOrder) || item.visitOrder < 1 || item.visitOrder > 500)) throw new Error('방문 순서를 확인해주세요.');
        if (item.reservationUrl) {
          try {
            const url = new URL(item.reservationUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
          } catch { throw new Error('예약 링크는 올바른 http 또는 https 주소로 입력해주세요.'); }
        }
      }
      const usedOrders = new Set<string>();
      for (const item of tripPlaces.filter((entry) => entry.status === 'scheduled')) {
        if (item.visitOrder === undefined) throw new Error('확정 장소의 방문 순서를 입력해주세요.');
        const key = `${item.visitDate}:${item.visitOrder}`;
        if (usedOrders.has(key)) throw new Error('같은 날짜에 방문 순서가 겹칩니다.');
        usedOrders.add(key);
      }
      const now = new Date().toISOString();
      const id = activeBoardId ?? crypto.randomUUID();
      const previous = savedBoards.find((board) => board.id === id);
      const board: SavedBoard = {
        id, title: cleanTitle,
        cards: boardCards.map((card) => ({ ...card })),
        connections: connections.map((connection) => ({ ...connection })),
        tripMeta: { ...tripMeta },
        tripPlaces: tripPlaces.map((item) => ({ ...item, snapshot: { ...item.snapshot } })),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      const next = previous
        ? savedBoards.map((item) => item.id === id ? board : item)
        : [board, ...savedBoards];
      if (!persistBoardList(key, next, id)) setSyncError('브라우저 백업은 저장하지 못했습니다. 서버 저장 상태를 확인해주세요.');
      setSavedBoards(next);
      setActiveBoardId(id);
      setSyncStatus('pending');
      return id;
    },
    openBoard: (id) => {
      const board = savedBoards.find((item) => item.id === id);
      if (!board) return false;
      setApiWorkspaceBoardId(null);
      boardDraft.current = { cards: board.cards, connections: board.connections,
        tripMeta: board.tripMeta ?? emptyTripMeta(),
        tripPlaces: board.tripPlaces ?? placesFromLegacyCards(board.cards, places), activeBoardId: id };
      setBoardCards(board.cards.map((card) => ({ ...card })));
      setConnections(board.connections.map((connection) => ({ ...connection })));
      setActiveBoardId(id);
      setTripMeta(board.tripMeta ?? emptyTripMeta());
      setTripPlaces(board.tripPlaces ?? placesFromLegacyCards(board.cards, places));
      return true;
    },
    createBoard: () => {
      setBoardCards([]);
      setConnections([]);
      setActiveBoardId(null);
      setTripMeta(emptyTripMeta());
      setTripPlaces([]);
      setApiWorkspaceBoardId(null);
      boardDraft.current = { cards: [], connections: [], tripMeta: emptyTripMeta(), tripPlaces: [], activeBoardId: null };
    },
    deleteBoard: (id) => {
      const next = savedBoards.filter((item) => item.id !== id);
      const nextActiveId = activeBoardId === id ? null : activeBoardId;
      if (!persistBoardList(key, next, nextActiveId)) setSyncError('브라우저 백업은 저장하지 못했습니다. 서버 저장 상태를 확인해주세요.');
      setSavedBoards(next);
      if (activeBoardId === id) {
        setBoardCards([]);
        setConnections([]);
        setActiveBoardId(null);
        setTripMeta(emptyTripMeta());
        setTripPlaces([]);
      }
    },

    apiWorkspaceBoardId,
    loadApiBoard: (board) => {
      if (!apiWorkspaceBoardId) {
        boardDraft.current = { cards: boardCards, connections, tripMeta, tripPlaces, activeBoardId };
      }
      setApiWorkspaceBoardId(board.id);
      setBoardCards(board.data.cards.map((card) => ({ ...card })));
      setConnections(board.data.connections.map((connection) => ({ ...connection })));
      setTripMeta(board.data.tripMeta ?? emptyTripMeta());
      setTripPlaces(board.data.tripPlaces ?? []);
    },
    adoptCreatedBoard: (id) => {
      boardDraft.current = { cards: [], connections: [], tripMeta: emptyTripMeta(), tripPlaces: [], activeBoardId: null };
      setApiWorkspaceBoardId(id);
      setActiveBoardId(null);
    },
    restoreBoardDraft: () => {
      const draft = boardDraft.current;
      setApiWorkspaceBoardId(null);
      setBoardCards(draft.cards);
      setConnections(draft.connections);
      setTripMeta(draft.tripMeta);
      setTripPlaces(draft.tripPlaces);
      setActiveBoardId(draft.activeBoardId);
    },

    diaryFolders,
    diaryNotes,
    chatConversations,
    setChatConversations,
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

  if (bootError) return <div className="m-auto max-w-md p-6 text-sm text-ink" role="alert">
    <p>{bootError}</p>
    <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}
      className="rounded-lg bg-teal-deep px-4 py-2 text-white">다시 시도</button>
    {bootError.includes('브라우저와 서버의 여행 데이터가 다릅니다') && <div className="mt-4 flex flex-col items-start gap-2">
      <button type="button" onClick={() => {
        const backup = new Blob([JSON.stringify(persisted, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(backup);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tteonayo-local-backup-${user.id}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setBackupDownloaded(true);
      }} className="rounded-lg border border-line bg-white px-4 py-2 text-teal-deep">브라우저 데이터 백업</button>
      <button type="button" disabled={!backupDownloaded} onClick={() => {
        localStorage.setItem(syncHashKey, stableStringify(persisted));
        setLoadAttempt((attempt) => attempt + 1);
      }} className="rounded-lg border border-line bg-white px-4 py-2 text-teal-deep disabled:opacity-50">백업 후 서버 데이터 열기</button>
      <p className="m-0 text-xs text-muted">서버 데이터를 열면 이 브라우저의 다른 내용은 다운로드한 백업 파일에만 남습니다.</p>
    </div>}
  </div>;
  if (!serverReady) return <div className="m-auto p-6 text-sm text-muted" role="status">여행 데이터를 불러오는 중입니다.</div>;
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip은 TripProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
