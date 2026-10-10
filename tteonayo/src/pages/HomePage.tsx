import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center">
        <h2 className="m-0 text-[17px] font-display font-bold text-ink">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedIds, savedBoards, boardCards, activeBoardId, hasUnsavedBoardChanges, openBoard } = useTrip();
  const recentBoards = [...savedBoards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

  const stats = [
    { value: savedIds.length, label: '저장한 장소' },
    { value: savedBoards.length, label: '저장한 일정판' },
    { value: boardCards.length, label: '현재 일정판 카드' },
  ];

  return (
    <>
      <Topbar title={`안녕하세요, ${user?.name}님`} stamp={new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date())} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1080px] mx-auto px-8 py-8">
          {/* 히어로 */}
          <section className="bg-teal-deep text-paper rounded-[20px] px-9 py-9 relative overflow-hidden mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-7">
            <div className="relative z-10 lg:max-w-[440px]">
              <h1 className="font-display text-[30px] leading-[1.35] mb-3">
                기록이 곧, 다음 여행이 됩니다
              </h1>
              <p className="text-[#E4EFEC] text-[14.5px] leading-[1.75] mb-6">
                저장한 장소를 카드로 불러와 여행 동선을 만들고, 메모와 사진을 더해 나만의 일정판을 완성해 보세요.
              </p>
              <button
                onClick={() => navigate('/board')}
                className="bg-pin hover:bg-[#c23c3c] text-white px-6 py-3 rounded-xl text-[14.5px] font-bold cursor-pointer border-none transition-colors"
              >
                내 일정판 열기 →
              </button>
            </div>
            <div className="hero-map-float relative z-0 self-center lg:mt-5 shrink-0 w-[230px] h-[190px] lg:w-[280px] lg:h-[220px]" aria-hidden="true">
              <img src="/map-illustration.png" alt="" className="w-full h-full object-contain drop-shadow-[0_16px_20px_rgba(8,36,34,0.4)]" />
            </div>
          </section>

          {/* 통계 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-xl border border-line px-6 py-5"
              >
                <div>
                  <div className="font-display text-[26px] font-bold text-teal-deep leading-none">
                    {s.value}
                  </div>
                  <div className="text-[13px] text-muted font-medium mt-2">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <SectionTitle>다음 여행 준비</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            <button type="button" onClick={() => navigate('/map')}
              className="bg-white rounded-xl p-6 text-left cursor-pointer border border-line hover:border-teal">
              <h3 className="m-0 text-[16px] font-semibold text-teal-deep">장소 기록하기</h3>
              <p className="m-0 mt-2 text-sm leading-relaxed text-muted">지도에서 가고 싶은 장소를 저장하고 메모를 남겨보세요.</p>
            </button>
            <button type="button" onClick={() => navigate('/chat')}
              className="bg-white rounded-xl p-6 text-left cursor-pointer border border-line hover:border-teal">
              <h3 className="m-0 text-[16px] font-semibold text-teal-deep">지역별 대화 이어가기</h3>
              <p className="m-0 mt-2 text-sm leading-relaxed text-muted">여행 지역별 질문을 기록하고 현재 날씨를 확인해 보세요.</p>
            </button>
          </div>

          <SectionTitle action={<button type="button" onClick={() => navigate('/diary')}
            className="text-[12.5px] text-teal font-semibold bg-transparent border-none cursor-pointer">기록함 전체 보기 →</button>}>
            최근 저장한 일정판
          </SectionTitle>
          {recentBoards.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {recentBoards.map((board) => (
                <button key={board.id} type="button" onClick={() => {
                  if (board.id !== activeBoardId && hasUnsavedBoardChanges &&
                    !window.confirm('저장하지 않은 일정판 변경사항이 있습니다. 다른 일정판을 열까요?')) return;
                  if (openBoard(board.id)) navigate('/board');
                }}
                  className="bg-white rounded-xl p-5 text-left cursor-pointer border border-line hover:border-teal">
                  <h3 className="m-0 text-[15px] font-semibold text-teal-deep line-clamp-2">{board.title}</h3>
                  {(board.tripMeta?.region || board.tripMeta?.startDate) &&
                    <p className="m-0 mt-2 text-xs text-muted">{[board.tripMeta?.region, board.tripMeta?.startDate].filter(Boolean).join(' · ')}</p>}
                  <p className="m-0 mt-2 text-xs text-muted">카드 {board.cards.length}개 · 동선 {board.connections.length}개</p>
                  <span className="block mt-4 text-xs text-teal">일정판 다시 열기 →</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-line rounded-xl p-6 text-sm text-muted">
              아직 저장한 일정판이 없어요. 화이트보드에서 여행 동선을 만들고 기록함에 저장해 보세요.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
