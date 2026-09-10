import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { trips } from '../data/mockData';
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
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-5 rounded-full bg-teal" />
        <h2 className="m-0 text-[17px] font-display font-bold text-ink">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { savedIds, diaryFolders } = useTrip();

  const stats = [
    { emoji: '📍', value: savedIds.length, label: '저장한 장소' },
    { emoji: '📖', value: diaryFolders.length, label: '여행 다이어리' },
    { emoji: '🗓️', value: trips.filter((t) => t.status === '계획 중').length, label: '계획 중인 여행' },
  ];

  return (
    <>
      <Topbar title={`안녕하세요, ${user?.name}님`} stamp="TODAY · OCT 17" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1080px] mx-auto px-8 py-8">
          {/* 히어로 */}
          <section className="bg-teal-deep text-paper rounded-[20px] px-9 py-9 relative overflow-hidden mb-6">
            <div className="absolute right-9 top-9 hidden sm:flex items-center gap-2 font-mono text-[11px] text-[#BFE0DB]">
              <span>서울</span>
              <span className="w-12 border-t border-dashed border-[#5A928D]" />
              <span className="w-1.5 h-1.5 rounded-full bg-pin" />
              <span>순천</span>
            </div>
            <h1 className="font-display text-[30px] leading-[1.35] mb-3 max-w-[440px]">
              기록이 곧, 다음 여행이 됩니다
            </h1>
            <p className="text-[#E4EFEC] text-[14.5px] leading-[1.75] max-w-[400px] mb-6">
              지난 여행에서 남긴 장소와 취향을 AI가 분석해 새 일정 초안을 그려드려요.
            </p>
            <button
              onClick={() => navigate('/chat')}
              className="bg-pin hover:bg-[#c23c3c] text-white px-6 py-3 rounded-xl text-[14.5px] font-bold cursor-pointer border-none transition-colors"
            >
              AI에게 새 일정 물어보기 →
            </button>
          </section>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-4 mb-12">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3.5 shadow-card"
              >
                <span className="w-11 h-11 rounded-xl bg-paper flex items-center justify-center text-[20px] shrink-0">
                  {s.emoji}
                </span>
                <div>
                  <div className="font-display text-[26px] font-bold text-teal-deep leading-none">
                    {s.value}
                  </div>
                  <div className="text-[13px] text-muted font-medium mt-2">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* AI 제안 */}
          <SectionTitle
            action={
              <button
                onClick={() => navigate('/chat')}
                className="text-[12.5px] text-teal font-semibold hover:text-teal-deep cursor-pointer bg-transparent border-none"
              >
                채팅에서 이어가기 →
              </button>
            }
          >
            AI 여정 어시스턴트
          </SectionTitle>
          <div className="bg-white rounded-2xl p-6 mb-12 shadow-card border-l-[3px] border-l-teal">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center text-white font-display font-bold text-[13px]">
                AI
              </span>
              <div className="leading-tight">
                <div className="text-[13px] font-bold text-ink">떠나요 AI</div>
                <div className="text-[11.5px] text-muted">저장한 장소를 분석했어요</div>
              </div>
            </div>
            <p className="m-0 text-[15px] leading-[1.9] text-ink-soft max-w-[600px]">
              골목 감성 카페를 자주 기록에 남기셨네요. 다음 순천 여행 코스로{' '}
              <b className="text-ink font-bold">순천만 국가정원</b> 인근의 숨은 스팟 3곳과 최적의 도보
              동선을 구성해 보았어요. 10월 갈대밭 물빛 데이터를 반영해 일몰 시간대 코스도 마련되어
              있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['#감성카페', '#도보여행', '#갈대밭산책'].map((tag) => (
                <span
                  key={tag}
                  className="text-[12.5px] bg-[#EAF1EF] border border-[#D3E3DF] px-3 py-1.5 rounded-full text-teal-deep font-semibold"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 여행 아카이브 */}
          <SectionTitle>최근 여행 아카이브</SectionTitle>
          <div className="grid grid-cols-3 gap-5">
            {trips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => navigate(`/${trip.linkTo}`)}
                className="group bg-white rounded-2xl overflow-hidden text-left cursor-pointer shadow-card transition-transform hover:-translate-y-1"
              >
                <div className="h-[150px] relative bg-sand overflow-hidden">
                  <img
                    src={trip.coverUrl}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  <span
                    className={`absolute top-3 left-3 text-[10.5px] px-2 py-1 rounded-md font-bold ${
                      trip.status === '계획 중' ? 'bg-pin text-white' : 'bg-white/95 text-teal-deep'
                    }`}
                  >
                    {trip.status}
                  </span>
                  <h3 className="absolute bottom-2.5 left-3.5 right-3 m-0 text-[15.5px] font-bold text-white leading-snug drop-shadow-md">
                    {trip.title}
                  </h3>
                </div>
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <span className="text-[12.5px] text-muted">{trip.dateRange}</span>
                  <span className="text-[13px] text-teal">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
