// 화면 확대(%)가 아니라 글자 크기만 바꾸는 설정. 이 기기·브라우저에만 저장한다.
export type FontScale = 'small' | 'normal' | 'large';

export const FONT_SCALES: { value: FontScale; label: string }[] = [
  { value: 'small', label: '작게' },
  { value: 'normal', label: '보통' },
  { value: 'large', label: '크게' },
];

const STORAGE_KEY = 'tteonayo:font-scale';

export function readFontScale(): FontScale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'small' || saved === 'large') return saved;
  } catch { /* 저장소를 쓸 수 없으면 보통 크기 */ }
  return 'normal';
}

export function applyFontScale(scale: FontScale) {
  document.documentElement.dataset.fontScale = scale;
  try { localStorage.setItem(STORAGE_KEY, scale); } catch { /* 이번 화면에만 적용 */ }
}
