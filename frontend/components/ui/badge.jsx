// 極小の Badge コンポーネント（variant="outline"のみ対応の stub）
export function Badge({ variant = "outline", className = "", children }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";
  const outline = "border border-cyan-400/40 text-cyan-200";
  return <span className={`${base} ${outline} ${className}`}>{children}</span>;
}
