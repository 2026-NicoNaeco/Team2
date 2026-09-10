import { useState } from 'react';
import Topbar from '../components/Topbar';
import { diaryEntries } from '../data/mockData';
import { useTrip } from '../context/TripContext';

export default function DiaryPage() {
  const { diaryFolders, addDiaryFolder, renameDiaryFolder, removeDiaryFolder } = useTrip();

  const [selectedFolder, setActiveFolder] = useState(diaryFolders[0]?.id ?? '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // 선택한 폴더가 삭제됐으면 첫 폴더로 (렌더 중 계산)
  const activeFolder = diaryFolders.some((f) => f.id === selectedFolder)
    ? selectedFolder
    : diaryFolders[0]?.id ?? '';

  const visibleEntries = diaryEntries.filter((e) => e.folderId === activeFolder);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setDraft(name);
  };
  const commitRename = () => {
    if (editingId) renameDiaryFolder(editingId, draft);
    setEditingId(null);
  };
  const commitAdd = () => {
    if (newName.trim()) addDiaryFolder(newName);
    setNewName('');
    setAdding(false);
  };
  const handleDelete = (id: string, name: string) => {
    if (diaryFolders.length <= 1) return;
    if (window.confirm(`'${name}' 폴더를 삭제할까요?`)) removeDiaryFolder(id);
  };

  return (
    <>
      <Topbar
        title="나의 여행 다이어리 기록함"
        stamp={`폴더 ${diaryFolders.length}개 · 이 폴더 기록 ${visibleEntries.length}개`}
      />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex gap-6 h-[calc(100vh-220px)]">
          {/* 폴더 목록 */}
          <div className="w-64 bg-white border border-line rounded-2xl p-4 shrink-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between mb-1 px-1">
              <span className="text-xs tracking-wider uppercase text-[#8B8272] font-semibold">
                여행 로그 폴더
              </span>
              <button
                onClick={() => {
                  setAdding(true);
                  setNewName('');
                }}
                className="text-teal-deep text-sm leading-none w-6 h-6 rounded-md hover:bg-paper cursor-pointer border-none bg-transparent"
                aria-label="폴더 추가"
              >
                ＋
              </button>
            </div>

            {diaryFolders.map((folder) => {
              const active = activeFolder === folder.id;
              if (editingId === folder.id) {
                return (
                  <input
                    key={folder.id}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="px-3 py-2.5 rounded-[10px] text-sm border border-teal outline-none"
                  />
                );
              }
              return (
                <div
                  key={folder.id}
                  className={`group/folder flex items-center gap-2 px-3 py-2.5 rounded-[10px] cursor-pointer text-sm transition-colors ${
                    active
                      ? 'bg-paper text-teal-deep font-semibold'
                      : 'text-[#555] hover:bg-paper hover:text-teal-deep'
                  }`}
                  onClick={() => setActiveFolder(folder.id)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-[18px] h-[18px] shrink-0 fill-sand stroke-teal"
                    strokeWidth={1.5}
                  >
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate">{folder.name}</span>
                  <span className="flex gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(folder.id, folder.name);
                      }}
                      className="w-6 h-6 rounded-md text-[12px] text-[#B7AE97] hover:text-teal hover:bg-white cursor-pointer bg-transparent border-none transition-colors"
                      aria-label="폴더 이름 변경"
                    >
                      ✎
                    </button>
                    {diaryFolders.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(folder.id, folder.name);
                        }}
                        className="w-6 h-6 rounded-md text-[12px] text-[#B7AE97] hover:text-pin hover:bg-white cursor-pointer bg-transparent border-none transition-colors"
                        aria-label="폴더 삭제"
                      >
                        🗑
                      </button>
                    )}
                  </span>
                </div>
              );
            })}

            {adding && (
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitAdd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdd();
                  if (e.key === 'Escape') setAdding(false);
                }}
                placeholder="새 폴더 이름"
                className="px-3 py-2.5 rounded-[10px] text-sm border border-teal outline-none"
              />
            )}
          </div>

          {/* 다이어리 카드 피드 */}
          <div className="flex-1 overflow-y-auto">
            {visibleEntries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#8B8272] gap-2">
                <span className="text-3xl">🗂️</span>
                <p className="m-0 text-sm">이 폴더에는 아직 기록이 없어요.</p>
                <p className="m-0 text-[12px]">여행을 다녀오면 여기에 다이어리가 쌓여요.</p>
              </div>
            ) : (
            <div className="grid grid-cols-3 gap-4.5">
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white border border-line rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="px-4 py-3 border-b border-[#EFE9DA] flex justify-between items-center bg-[#faf8f5]">
                    <span className="text-[11px] font-mono font-semibold text-pin">
                      {entry.dayLabel}
                    </span>
                    <div className="text-xs text-[#FFB800]">
                      {'★'.repeat(Math.round(entry.rating))} {entry.rating.toFixed(1)}
                    </div>
                  </div>
                  <div
                    className="h-[140px] bg-[#EAE3D2] bg-cover bg-center"
                    style={{ backgroundImage: `url('${entry.imageUrl}')` }}
                  />
                  <div className="p-4 flex-1 flex flex-col gap-1.5">
                    <h4 className="m-0 text-[15px] text-teal-deep">{entry.title}</h4>
                    <p className="m-0 text-[12.5px] leading-relaxed text-[#4A5560]">{entry.content}</p>
                  </div>
                  <div className="px-4 py-3 border-t border-dashed border-line flex justify-between text-xs text-[#8B8272]">
                    <span>💬 댓글 {entry.comments}</span>
                    <div className="flex gap-3">
                      <span className="flex items-center gap-1 cursor-pointer hover:text-teal">
                        ❤️ {entry.likes}
                      </span>
                      <span className="flex items-center gap-1 cursor-pointer hover:text-teal">
                        🔗 공유
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
