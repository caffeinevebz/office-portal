import { cn } from "@/lib/format";

/* The Ledgify identity, recreated as scalable SVG/CSS from the brand
   artwork: a chalk gear holding a serif "L" on a deep-green chalkboard,
   with the "Ledg-ify" wordmark (ify in chalk green). */

const CHALK = "#f2f6f1";
const CHALK_GREEN = "#7fc98f";

/** Chalk gear with the serif L — the compact mark (sidebar, tiles). */
export function LedgifyMark({
  className,
  stroke = CHALK,
}: {
  className?: string;
  stroke?: string;
}) {
  // 12-tooth gear: teeth as short radial strokes around the ring. Fixed
  // 2-decimal coordinates keep server and client markup byte-identical.
  const teeth = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const x1 = (50 + Math.cos(a) * 38).toFixed(2);
    const y1 = (50 + Math.sin(a) * 38).toFixed(2);
    const x2 = (50 + Math.cos(a) * 47).toFixed(2);
    const y2 = (50 + Math.sin(a) * 47).toFixed(2);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={11} />;
  });
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g stroke={stroke} fill="none" strokeLinecap="round">
        {teeth}
        <circle cx="50" cy="50" r="37" strokeWidth={6.5} />
      </g>
      <text
        x="50"
        y="54"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="52"
        fill={stroke}
      >
        L
      </text>
    </svg>
  );
}

/** The full chalkboard logo panel used on the login screen. */
export function LedgifyLogoPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-[#22483a] via-[#1c3b2f] to-[#132a21] px-8 py-10 text-center",
        className,
      )}
    >
      <div className="relative">
        <LedgifyMark className="h-32 w-32 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] sm:h-40 sm:w-40" />
        {/* satellite gears */}
        <LedgifyMark className="absolute -top-4 -left-8 h-10 w-10 opacity-50" />
        <LedgifyMark className="absolute -right-9 top-3 h-8 w-8 opacity-40" />
        <LedgifyMark className="absolute -bottom-3 -right-6 h-12 w-12 opacity-50" />
      </div>
      <div>
        <p
          className="text-5xl font-bold tracking-tight sm:text-6xl"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          <span style={{ color: CHALK }}>Ledg</span>
          <span style={{ color: CHALK_GREEN }}>ify</span>
        </p>
        <p
          className="mt-3 text-xs font-semibold tracking-[0.35em] uppercase sm:text-sm"
          style={{ color: CHALK }}
        >
          Manage&thinsp;.&ensp;Organize&thinsp;.&ensp;Grow&thinsp;.
        </p>
        <p
          className="mt-2 text-[10px] font-medium tracking-[0.3em] uppercase sm:text-xs"
          style={{ color: CHALK_GREEN }}
        >
          CA Office Management Software
        </p>
      </div>
    </div>
  );
}
