"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

/* The Ledgify identity. If the original artwork is present in the repo at
   public/brand/logo-full.png it is used as-is; otherwise the logo is
   recreated as scalable SVG/CSS: a chalk gear holding a serif "L" on a
   deep-green chalkboard, with the "Ledg-ify" wordmark (ify in chalk green). */

const CHALK = "#f2f6f1";
const CHALK_GREEN = "#7fc98f";

/** Compact app mark for the sidebar / mobile header. Uses the uploaded
 *  original app icon if present, else the recreated gear. */
export function AppMark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LedgifyMark className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon-192.png"
      alt=""
      onError={() => setFailed(true)}
      className={cn("object-contain", className)}
    />
  );
}

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

// Where the uploaded original logo may live — first hit wins, then the
// recreated SVG. Covers both public/ root and public/brand/.
const LOGO_CANDIDATES = ["/logo-full.png", "/brand/logo-full.png"];

/** The full chalkboard logo panel used on the login screen. Prefers the
 *  original uploaded artwork; the recreated SVG shows until (and unless)
 *  one of the candidate files loads. */
export function LedgifyLogoPanel({ className }: { className?: string }) {
  const [art, setArt] = useState<"loading" | "original" | "recreated">("loading");
  const [candidate, setCandidate] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  function advance() {
    setCandidate((c) => {
      const next = c + 1;
      if (next >= LOGO_CANDIDATES.length) setArt("recreated");
      return next;
    });
  }

  // The image can finish loading before React attaches its onLoad handler
  // (cached / SSR paint), so reconcile from the element's own state on mount
  // and whenever we try a new candidate.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      if (img.naturalWidth > 0) setArt("original");
      else advance();
    }
  }, [candidate]);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 px-6 py-8 text-center",
        art === "original"
          ? "bg-[#1d4033]"
          : "bg-gradient-to-br from-[#22483a] via-[#1c3b2f] to-[#132a21]",
        className,
      )}
    >
      {art !== "recreated" && candidate < LOGO_CANDIDATES.length && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={LOGO_CANDIDATES[candidate]}
          ref={imgRef}
          src={LOGO_CANDIDATES[candidate]}
          alt="Ledgify — Manage. Organize. Grow. CA office management software"
          onLoad={() => setArt("original")}
          onError={advance}
          className={cn(
            "max-h-[70vh] w-full max-w-md rounded-2xl object-contain shadow-2xl lg:max-w-lg",
            art !== "original" && "hidden",
          )}
        />
      )}
      {art !== "original" && (
        <>
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
        </>
      )}
    </div>
  );
}
