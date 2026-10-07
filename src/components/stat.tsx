import { Icons, type IconName } from "./icons";

export type StatTone = "brand" | "good" | "bad" | "teal" | "orange" | "sky" | "violet" | "pink" | "amber";

const TONES: Record<StatTone, string> = {
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  bad: "bg-danger-soft text-danger",
  teal: "bg-teal-soft text-teal",
  orange: "bg-orange-soft text-orange",
  sky: "bg-sky-soft text-sky",
  violet: "bg-violet-soft text-violet",
  pink: "bg-pink-soft text-pink",
  amber: "bg-amber-soft text-amber",
};

/** כרטיס מספר: בועת אייקון צבעונית, מספר גדול, תווית קצרה */
export function Stat({
  label,
  value,
  hint,
  tone = "brand",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  icon?: IconName;
}) {
  const Icon = icon ? Icons[icon] : null;
  return (
    <div className="card flex items-center gap-4 p-4">
      {Icon && (
        <span className={`bubble ${TONES[tone]}`}>
          <Icon size={20} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-muted">{label}</p>
        <p className="num text-right text-[1.5rem] font-extrabold leading-tight tracking-tight">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}
