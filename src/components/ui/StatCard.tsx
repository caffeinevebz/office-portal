import { cn } from "@/lib/format";

// Icon-tile gradients keyed by accent — the icon sits on a soft gradient chip.
const ACCENTS: Record<string, string> = {
  indigo: "from-brand-500 to-brand-700",
  brand: "from-brand-500 to-brand-700",
  emerald: "from-fern-400 to-fern-600",
  fern: "from-fern-400 to-fern-600",
  amber: "from-saffron-400 to-saffron-600",
  saffron: "from-saffron-400 to-saffron-600",
  rose: "from-rose-400 to-rose-600",
  blue: "from-sky-400 to-brand-600",
  violet: "from-violet-400 to-violet-600",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "brand",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            ACCENTS[accent] ?? ACCENTS.brand,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {hint && <div className="mt-3 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
