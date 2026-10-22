import type { ReactNode } from 'react';

type IconName = 'place' | 'memo' | 'text' | 'photo' | 'list' | 'expand' | 'pdf';

export default function BoardToolIcon({ name }: { name: IconName }) {
  const shapes: Record<IconName, ReactNode> = {
    place: <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    memo: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    text: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h10M12 8v9" /></>,
    photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 3 3 3-4 5 6" /></>,
    list: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h9M8 13h9M8 17h6" /><path d="M5.5 9h.01M5.5 13h.01M5.5 17h.01" strokeWidth="2.5" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /><path d="M3 3 9 9M21 3l-6 6M3 21l6-6M21 21l-6-6" /></>,
    pdf: <><path d="M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="M14 2v5h5M8 12h8M8 16h8" /></>,
  };
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    {shapes[name]}
  </svg>;
}
