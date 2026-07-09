import { badgeTone } from "@/lib/constants";
import { cn } from "@/lib/format";

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: Parameters<typeof badgeTone>[0];
  className?: string;
}) {
  const t = badgeTone(tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        t.bg,
        t.text,
        t.ring,
        className,
      )}
    >
      {children}
    </span>
  );
}
