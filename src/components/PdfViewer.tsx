"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ExternalLink, MessageCircle, Minus, Plus, Share2 } from "lucide-react";
import { cn } from "@/lib/format";

type Props = {
  /** Authenticated URL the PDF is fetched from. */
  src: string;
  /** How the document reads to a human, e.g. "Invoice APB/2627/001". */
  title: string;
  /** Name the file takes when shared or saved. */
  filename: string;
  /** Offer "WhatsApp" in the toolbar (usually opens the send modal). */
  onWhatsapp?: () => void;
  onClose: () => void;
};

/**
 * A PDF opened *inside* Ledgify rather than handed to the browser.
 *
 * Opening a PDF in a new tab strands the user — on a phone, and especially in
 * the installed app, they land in an external viewer with no way back and no
 * useful actions. Here the document stays in the app: Back returns to the
 * page behind it (as does the phone's back gesture), and the toolbar carries
 * Share, WhatsApp, Download and — for anyone who still wants it — open in a
 * new tab.
 */
export function PdfViewer({ src, title, filename, onWhatsapp, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  // Reading an invoice on a phone means magnifying it; zooming the whole
  // overlay by pinch would take the toolbar with it, so the document has its
  // own zoom and its own scroll box.
  const [zoom, setZoom] = useState(1);
  const canvasHost = useRef<HTMLDivElement>(null);

  // Fetch the bytes once: the same blob backs the pages on screen, the share
  // sheet and the download, so the PDF is built server-side only once.
  //
  // The pages are drawn with pdf.js rather than handed to an <iframe>: phone
  // browsers largely refuse to render a PDF inline (Android Chrome hands it
  // to a downloader, iOS Safari shows only the first page), which is what
  // sent people out of the app in the first place. Drawing to canvas looks
  // the same everywhere.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not open this document");
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFile(new File([blob], filename, { type: "application/pdf" }));

        // Loaded on demand — the library is far too big to sit in the bundle
        // of every page that merely links to a document. The *legacy* build,
        // because the modern one relies on JavaScript that plenty of phones
        // in use today do not have.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = await blob.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPages(pdf.numPages);

        const host = canvasHost.current;
        if (!host) return;
        host.replaceChildren();
        // Render at the container's width, doubled for sharpness on the
        // high-density screens phones actually have.
        const width = Math.min(host.clientWidth || 800, 1400);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "mx-auto mb-3 block max-w-full bg-white shadow-sm ring-1 ring-slate-200";
          canvas.setAttribute("data-testid", `pdf-page-${n}`);
          host.append(canvas);
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not open this document");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, filename]);

  // The phone's back gesture should close the document, not leave Ledgify.
  // A history entry is pushed on open and unwound on close — unless the pop
  // is what closed it, in which case the entry is already gone.
  useEffect(() => {
    window.history.pushState({ ledgifyPdf: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (window.history.state?.ledgifyPdf) window.history.back();
    };
    // Mounted once per document; onClose is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Share the file itself — on a phone this is the OS sheet, so the PDF can
  // go to WhatsApp, mail, Drive or anywhere else the device offers.
  const canShare =
    typeof navigator !== "undefined" &&
    !!file &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title, text: title });
      setShared("Shared.");
    } catch (e) {
      // A cancelled share sheet is not an error worth reporting.
      if (e instanceof Error && e.name === "AbortError") return;
      setShared("Sharing is not available here — use Download instead.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-2xl sm:mx-auto sm:w-full sm:max-w-4xl sm:rounded-xl">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <button
            onClick={onClose}
            data-testid="pdf-back"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {title}
            {pages > 1 && <span className="ml-2 font-normal text-slate-400">{pages} pages</span>}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <div className="mr-1 flex items-center rounded-lg border border-slate-200">
              <button
                onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                disabled={zoom <= 1}
                data-testid="pdf-zoom-out"
                className="rounded-l-lg px-1.5 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-xs tabular-nums text-slate-500">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
                disabled={zoom >= 4}
                data-testid="pdf-zoom-in"
                className="rounded-r-lg px-1.5 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* On a phone these live in the bar under the document instead,
                which leaves the title room to breathe. */}
            {canShare && (
              <ToolbarButton onClick={share} icon={Share2} label="Share" testId="pdf-share" primary />
            )}
            {onWhatsapp && (
              <ToolbarButton
                onClick={onWhatsapp}
                icon={MessageCircle}
                label="WhatsApp"
                testId="pdf-whatsapp"
              />
            )}
            <a
              href={url ?? src}
              download={filename}
              data-testid="pdf-download"
              className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:inline-flex"
              title="Save the PDF to this device"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
            <a
              href={url ?? src}
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:inline-flex"
              title="Open in a new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {shared && (
          <p className="shrink-0 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">{shared}</p>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
          {err ? (
            <p className="p-6 text-center text-sm text-rose-600">{err}</p>
          ) : (
            <>
              {pages === 0 && (
                <p className="p-6 text-center text-sm text-slate-500">Preparing the document…</p>
              )}
              {/* Zooming widens the page beyond the box, which then scrolls —
                  the surrounding app never moves. */}
              <div
                ref={canvasHost}
                data-testid="pdf-pages"
                style={{ width: `${zoom * 100}%` }}
                className="mx-auto"
              />
            </>
          )}
        </div>

        {/* On a phone the toolbar icons are small; repeat the two actions that
            matter as full-width buttons under the document. */}
        <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:hidden">
          {canShare && (
            <button
              onClick={share}
              data-testid="pdf-share-mobile"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Share2 className="h-4 w-4" /> Share PDF
            </button>
          )}
          {onWhatsapp && (
            <button
              onClick={onWhatsapp}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </button>
          )}
          <a
            href={url ?? src}
            download={filename}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
          >
            <Download className="h-4 w-4" /> Save
          </a>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  testId,
  primary,
}: {
  onClick: () => void;
  icon: typeof Share2;
  label: string;
  testId: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium sm:inline-flex",
        primary ? "text-brand-700 hover:bg-brand-50" : "text-slate-600 hover:bg-slate-100",
      )}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
