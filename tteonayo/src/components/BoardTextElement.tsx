import type { PointerEvent } from 'react';
import type { BoardCard } from '../types';

interface Props {
  card: BoardCard;
  selected: boolean;
  editing: boolean;
  onChange: (patch: Partial<BoardCard>) => void;
  onEdit: () => void;
  onFinish: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, side: 'left' | 'right') => void;
}

const toolbarButton = 'shrink-0 rounded px-2 py-1 text-xs text-teal-deep hover:bg-paper focus-visible:outline-teal cursor-pointer';

export default function BoardTextElement({ card, selected, editing, onChange, onEdit, onFinish, onDuplicate, onDelete, onResizeStart }: Props) {
  const fontSize = card.textFontSize ?? 28;
  const bold = card.textBold ?? true;
  const align = card.textAlign ?? 'left';
  const textStyle = { fontSize, fontWeight: bold ? 700 : 400, textAlign: align } as const;
  const resizeHandle = (side: 'left' | 'right', corner: 'top' | 'bottom') =>
    <button key={`${side}-${corner}`} type="button" aria-label="텍스트 너비 조절"
      onPointerDown={(event) => onResizeStart(event, side)}
      className={`absolute z-30 h-3.5 w-3.5 rounded-full border border-[#4B8CF6] bg-white cursor-ew-resize print:hidden
        ${side === 'left' ? '-left-[7px]' : '-right-[7px]'} ${corner === 'top' ? '-top-[7px]' : '-bottom-[7px]'}`} />;

  return <div className="relative min-h-[38px] px-1 py-0.5">
    {selected && <div role="toolbar" aria-label="텍스트 도구"
      onPointerDown={(event) => event.stopPropagation()}
      className={`absolute left-0 z-40 flex max-w-[min(90vw,440px)] items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-white p-1 shadow-lg print:hidden
        ${card.top < 70 ? 'top-[calc(100%+10px)]' : 'bottom-[calc(100%+10px)]'}`}>
      <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(); }} className={toolbarButton}>텍스트 편집</button>
      <span className="mx-0.5 h-5 border-l border-line" />
      <button type="button" onClick={(event) => { event.stopPropagation(); onChange({ textFontSize: Math.max(12, fontSize - 2) }); }}
        aria-label="글자 작게" className={toolbarButton}>−</button>
      <span className="min-w-6 text-center text-xs tabular-nums text-ink">{fontSize}</span>
      <button type="button" onClick={(event) => { event.stopPropagation(); onChange({ textFontSize: Math.min(72, fontSize + 2) }); }}
        aria-label="글자 크게" className={toolbarButton}>＋</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onChange({ textBold: !bold }); }}
        aria-label="굵게" aria-pressed={bold} className={`${toolbarButton} font-bold ${bold ? 'bg-paper' : ''}`}>B</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onChange({ textAlign: align === 'left' ? 'center' : align === 'center' ? 'right' : 'left' }); }}
        aria-label="정렬 변경" title={`현재 ${align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'} 정렬`} className={toolbarButton}>정렬</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onDuplicate(); }} className={toolbarButton}>복제</button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(); }} className={`${toolbarButton} text-pin`}>삭제</button>
    </div>}
    {editing ? <textarea autoFocus aria-label="일정판 텍스트 입력" placeholder="텍스트를 입력하세요" maxLength={10000}
      rows={Math.min(12, Math.max(2, card.description.split('\n').length + 1))}
      value={card.description} onChange={(event) => onChange({ description: event.target.value })}
      onBlur={onFinish} onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === 'Escape' || event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onFinish(); } }}
      style={textStyle} className="block w-full min-h-[2.5rem] max-h-[480px] resize-y overflow-auto border-none bg-transparent p-0 leading-tight text-teal-deep outline-none select-text print:hidden" />
      : <div onDoubleClick={(event) => { event.stopPropagation(); onEdit(); }}
        style={textStyle} className={`min-h-[2.5rem] whitespace-pre-wrap break-words leading-tight ${card.description ? 'text-teal-deep' : 'text-muted print:hidden'}`}>
        {card.description || '텍스트를 입력하세요'}
      </div>}
    {editing && <div style={textStyle} className="hidden whitespace-pre-wrap break-words leading-tight text-teal-deep print:block">{card.description}</div>}
    {selected && !editing && <>{resizeHandle('left', 'top')}{resizeHandle('right', 'top')}{resizeHandle('left', 'bottom')}{resizeHandle('right', 'bottom')}</>}
  </div>;
}
