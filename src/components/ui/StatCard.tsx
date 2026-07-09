import { cn } from "@/lib/format";

const ACCENTS: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "indigo",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            ACCENTS[accent],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {hint && <div className="mt-3 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
