import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  {
    to: '/home',
    label: '홈',
    icon: <path d="M3 12l9-9 9 9M5 10v10h14V10" />,
  },
  {
    to: '/map',
    label: '지도',
    icon: <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" />,
  },
  {
    to: '/chat',
    label: 'AI채팅',
    icon: <path d="M21 11.5a8.5 8.5 0 01-12.6 7.4L3 20l1.1-5.2A8.5 8.5 0 1121 11.5z" />,
  },
  {
    to: '/board',
    label: '일정판',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 20h8" />
      </>
    ),
  },
  {
    to: '/diary',
    label: '기록함',
    icon: (
      <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    ),
  },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <div className="w-[88px] shrink-0 bg-teal-deep flex flex-col items-center py-6 print:hidden">
      <div className="text-paper font-display font-bold text-xl mb-9 tracking-wide">떠나요</div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `w-14 h-14 rounded-2xl flex flex-col items-center justify-center mb-2.5 text-[11px] gap-1 border transition-colors ${
              isActive
                ? 'bg-teal text-white border-[#4C8F8A]'
                : 'text-[#B7D2CE] border-transparent hover:bg-white/10'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="none"
                strokeWidth={1.8}
                stroke={isActive ? '#fff' : '#B7D2CE'}
              >
                {item.icon}
              </svg>
              {item.label}
            </>
          )}
        </NavLink>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2 pt-4">
        {user && (
          <div className="text-[10px] text-[#B7D2CE] text-center leading-tight px-1">{user.name}님</div>
        )}
        <button
          onClick={logout}
          className="text-[10px] text-[#B7D2CE] hover:text-white bg-transparent border-none cursor-pointer"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
