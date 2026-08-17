"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { Textarea } from "@/components/ui/Field";
import { cn } from "@/lib/format";

// Dictation, for the auditor writing up observations with the file open in
// front of them and no hand free for the keyboard.
//
// The speech goes to the browser's own recognition — nothing is uploaded by
// the portal, and no audio is stored anywhere. Chrome and Edge have it; Firefox
// does not, so the button says as much instead of failing silently when
// pressed.

type SpeechResult = { transcript: string };
type SpeechAlternatives = { 0: SpeechResult; isFinal: boolean; length: number };
type SpeechEvent = { resultIndex: number; results: { [i: number]: SpeechAlternatives; length: number } };
type SpeechErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What went wrong, said the way the person at the desk would understand it. */
const MESSAGES: Record<string, string> = {
  "not-allowed":
    "The browser blocked the microphone. Allow it for this site and press the mic again.",
  "service-not-allowed":
    "The browser blocked the microphone. Allow it for this site and press the mic again.",
  "audio-capture": "No microphone was found. Plug one in, or check which device is selected.",
  network: "The speech service could not be reached. Check the connection and try again.",
  aborted: "",
  "no-speech": "Nothing was heard — press the mic and speak again.",
};

/** Whether this browser has speech recognition — false while rendering on the server. */
const noop = () => () => {};
const useSpeechSupported = () =>
  useSyncExternalStore(
    noop,
    () => !!recognitionCtor(),
    () => false,
  );

export function useDictation(onText: (chunk: string) => void, lang = "en-IN") {
  const supported = useSpeechSupported();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const restarts = useRef(0);
  // The callback changes on every keystroke; the recogniser must always call
  // the current one without being torn down and restarted mid-sentence.
  const sink = useRef(onText);
  useEffect(() => {
    sink.current = onText;
  }, [onText]);

  const stop = useCallback(() => {
    wanted.current = false;
    setListening(false);
    setInterim("");
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = lang;
    // Continuous, because an observation is a paragraph and not a search box.
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      let done = "";
      let saying = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        const said = result[0]?.transcript ?? "";
        if (result.isFinal) done += said;
        else saying += said;
      }
      if (done.trim()) {
        restarts.current = 0; // it is hearing us; the restart guard can reset
        sink.current(done.trim());
      }
      setInterim(saying);
    };

    r.onerror = (e) => {
      const message = MESSAGES[e.error] ?? "Dictation stopped unexpectedly.";
      // A blocked microphone will not start on the next press either, so the
      // loop is ended rather than retried against the same refusal.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") wanted.current = false;
      if (message) setError(message);
    };

    r.onend = () => {
      setInterim("");
      // Chrome ends the session after a pause even in continuous mode, so a
      // dictation that is still wanted is picked back up. If it ends over and
      // over without hearing anything, that is a fault, not a pause.
      if (wanted.current && restarts.current < 8) {
        restarts.current += 1;
        try {
          r.start();
          return;
        } catch {
          // Already restarted elsewhere — fall through and stop cleanly.
        }
      }
      if (wanted.current && restarts.current >= 8) {
        setError("Dictation kept dropping out. Press the mic to start again.");
      }
      wanted.current = false;
      setListening(false);
    };

    rec.current = r;
    wanted.current = true;
    restarts.current = 0;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Dictation could not be started. Press the mic to try again.");
      wanted.current = false;
    }
  }, [lang]);

  const toggle = useCallback(() => (wanted.current ? stop() : start()), [start, stop]);

  // A recogniser left running after the panel closes would keep the microphone
  // light on, which is alarming and rightly so.
  useEffect(() => {
    return () => {
      wanted.current = false;
      rec.current?.abort();
    };
  }, []);

  return { supported, listening, interim, error, toggle, stop };
}

/**
 * A textarea you can talk into. The mic sits inside the field, what is being
 * heard shows under it, and the text lands in the box the moment the phrase is
 * recognised — so the writer can carry on typing over it.
 */
export function DictatedTextarea({
  value,
  onValue,
  rows = 2,
  placeholder,
  className,
  lang,
  label = "Dictate",
}: {
  value: string;
  onValue: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  lang?: string;
  label?: string;
}) {
  // Read the live value through a ref: the recogniser hands over one phrase at
  // a time, and each must be appended to whatever is in the box by then.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const append = useCallback(
    (chunk: string) => {
      const before = latest.current.replace(/\s+$/, "");
      const next = before ? `${before} ${chunk}` : chunk;
      latest.current = next;
      onValue(next);
    },
    [onValue],
  );

  const { supported, listening, interim, error, toggle } = useDictation(append, lang);

  return (
    <div className={className}>
      <div className="relative">
        <Textarea
          rows={rows}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={placeholder}
          className={cn("pr-11", listening && "border-rose-300 ring-2 ring-rose-100")}
        />
        <button
          type="button"
          onClick={supported ? toggle : undefined}
          disabled={!supported}
          aria-pressed={listening}
          data-dictate={listening ? "listening" : supported ? "idle" : "unsupported"}
          title={
            supported
              ? listening
                ? "Stop dictating"
                : `${label} — speak and the words appear here`
              : "Dictation needs Chrome or Edge; this browser has no speech recognition"
          }
          className={cn(
            "absolute top-2 right-2 rounded-full p-1.5 transition-colors",
            listening
              ? "bg-rose-600 text-white hover:bg-rose-700"
              : supported
                ? "text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                : "cursor-not-allowed text-slate-200",
          )}
        >
          {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
          <span className="sr-only">{listening ? "Stop dictating" : label}</span>
        </button>
      </div>

      {listening && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-rose-600">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
          Listening…
          {interim && <span className="text-slate-500 italic">{interim}</span>}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}
    </div>
  );
}
