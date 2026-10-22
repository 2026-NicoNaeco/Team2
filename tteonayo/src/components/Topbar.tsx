interface TopbarProps {
  title: string;
  stamp: string;
}

export default function Topbar({ title, stamp }: TopbarProps) {
  return (
    <div className="h-16 border-b border-line flex items-center justify-between px-8 bg-paper shrink-0">
      <div className="font-display font-semibold text-xl">{title}</div>
      <div className="text-teal text-xs font-medium">
        {stamp}
      </div>
    </div>
  );
}
