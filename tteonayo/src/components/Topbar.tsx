interface TopbarProps {
  title: string;
  stamp: string;
}

export default function Topbar({ title, stamp }: TopbarProps) {
  return (
    <div className="h-16 border-b border-line flex items-center justify-between px-8 bg-paper shrink-0">
      <div className="font-display font-semibold text-xl">{title}</div>
      <div className="border border-dashed border-teal text-teal font-mono text-[11px] px-2.5 py-1 rounded-md -rotate-2">
        {stamp}
      </div>
    </div>
  );
}
