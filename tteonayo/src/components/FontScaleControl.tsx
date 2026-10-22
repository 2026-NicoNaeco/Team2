import { useState } from 'react';
import { applyFontScale, FONT_SCALES, readFontScale, type FontScale } from '../fontScale';

const SAMPLE_SIZE: Record<FontScale, string> = { small: '11px', normal: '13px', large: '16px' };

export default function FontScaleControl() {
  const [scale, setScale] = useState<FontScale>(readFontScale);

  return (
    <div role="group" aria-label="글자 크기" className="flex flex-col items-center gap-1">
      <span className="text-[length:calc(10px*var(--font-scale))] text-[#B7D2CE]">글자 크기</span>
      <div className="flex rounded-lg bg-white/10 p-0.5">
        {FONT_SCALES.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={scale === value} aria-label={`글자 ${label}`} title={label}
            onClick={() => { setScale(value); applyFontScale(value); }}
            // 버튼 자체 글씨는 설정과 관계없이 고정해 세 단계 차이가 보이게 한다.
            style={{ fontSize: SAMPLE_SIZE[value] }}
            className={`flex h-6 w-6 items-center justify-center rounded-md border-none font-semibold leading-none cursor-pointer ${scale === value
              ? 'bg-paper text-teal-deep' : 'bg-transparent text-[#B7D2CE] hover:text-white'}`}>
            가
          </button>
        ))}
      </div>
    </div>
  );
}
