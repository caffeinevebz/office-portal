"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import type { AuthUser } from "@/lib/auth/context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/format";

/** Four single-digit boxes that behave like one PIN input. */
export function PinInput({
  value,
  onChange,
  autoFocus = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function handle(i: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1);
    const next = value.slice(0, i).padEnd(i, " ") + (d || " ") + value.slice(i + 1);
    onChange(next.trimEnd().replace(/ /g, ""));
    if (d && i < 3) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs font-medium text-slate-700">{label}</p>
      )}
      <div className="flex gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            value={value[i] ?? ""}
            onChange={(e) => handle(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className={cn(
              "h-12 w-12 rounded-xl border border-slate-300 bg-white text-center text-xl font-semibold text-slate-900 shadow-sm",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function SetPinModal({
  user,
  onClose,
}: {
  user: AuthUser;
  onClose: () => void;
}) {
  const { data, refresh } = useResource<{ hasPin: boolean }>("/api/auth/pin");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const mismatch = confirm.length === 4 && pin !== confirm;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiMutate("/api/auth/pin", "POST", { pin });
      // Remember this account on the device so the login page offers PIN unlock.
      if (user?.email) {
        localStorage.setItem(
          "ledgify.quick",
          JSON.stringify({ email: user.email, name: user.name }),
        );
      }
      setMsg({ kind: "ok", text: "PIN saved — next time, unlock the app with it from the sign-in screen." });
      setPin("");
      setConfirm("");
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not save the PIN" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      await apiMutate("/api/auth/pin", "DELETE");
      localStorage.removeItem("ledgify.quick");
      setMsg({ kind: "ok", text: "PIN removed. Sign-in requires your password again." });
      refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not remove the PIN" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Quick-access PIN"
      description="A 4-digit PIN for faster sign-in on this device. Your password always keeps working."
      footer={
        <>
          {data?.hasPin && (
            <Button variant="ghost" onClick={remove} disabled={busy} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Remove PIN
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={busy || pin.length !== 4 || pin !== confirm}
          >
            <KeyRound className="h-4 w-4" />
            {busy ? "Saving…" : data?.hasPin ? "Change PIN" : "Set PIN"}
          </Button>
        </>
      }
    >
      {msg && (
        <div
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-xs ring-1",
            msg.kind === "ok"
              ? "bg-fern-50 text-fern-800 ring-fern-200"
              : "bg-rose-50 text-rose-700 ring-rose-200",
          )}
        >
          {msg.text}
        </div>
      )}
      {data?.hasPin && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          A PIN is already set for your account. Entering a new one replaces it.
        </p>
      )}
      <div className="flex flex-col gap-5">
        <PinInput label="New 4-digit PIN" value={pin} onChange={setPin} autoFocus />
        <PinInput label="Confirm PIN" value={confirm} onChange={setConfirm} />
        {mismatch && (
          <p className="-mt-3 text-xs text-rose-600">The PINs don&apos;t match yet.</p>
        )}
        <p className="text-xs text-slate-400">
          The PIN locks after 5 wrong attempts; signing in with your password
          unlocks it.
        </p>
      </div>
    </Modal>
  );
}
