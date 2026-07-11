"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Sparkles, KeyRound, UserRound } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { LedgifyLogoPanel } from "@/components/LedgifyLogo";
import { PinInput } from "@/components/SetPinModal";

type Branding = { name: string; tagline: string; hasLogo: boolean };
type QuickUser = { email: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const { data: setup } = useResource<{ needsSetup: boolean }>("/api/setup/status");
  const { data: branding } = useResource<Branding>("/api/branding");

  const [quick, setQuick] = useState<QuickUser | null>(null);
  const [mode, setMode] = useState<"password" | "pin">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A device that has set up a PIN remembers its user for quick unlock.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ledgify.quick");
      if (raw) {
        const q = JSON.parse(raw) as QuickUser;
        if (q?.email) {
          setQuick(q);
          setMode("pin");
        }
      }
    } catch {
      // ignore a malformed entry
    }
  }, []);

  useEffect(() => {
    document.title = branding?.name ? `${APP_NAME} · ${branding.name}` : APP_NAME;
  }, [branding?.name]);

  function finish() {
    router.push("/");
    router.refresh();
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiMutate("/api/auth/login", "POST", { email, password });
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  async function submitPin(value: string) {
    if (!quick || value.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiMutate("/api/auth/pin-login", "POST", { email: quick.email, pin: value });
      finish();
    } catch (err) {
      setPin("");
      setError(err instanceof Error ? err.message : "PIN sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel: top on phones, left on desktop */}
      <LedgifyLogoPanel className="min-h-[38vh] lg:min-h-screen lg:w-1/2" />

      {/* Sign-in panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {mode === "pin" && quick ? `Welcome back, ${quick.name.replace(/^CA\s+/, "").split(" ")[0]}` : "Sign in"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {mode === "pin"
                ? "Enter your 4-digit PIN to unlock"
                : branding?.name
                  ? `to continue to ${branding.name}`
                  : "to continue"}
            </p>
          </div>

          {setup?.needsSetup && (
            <Link
              href="/setup"
              className="mb-4 flex items-center gap-2 rounded-xl border border-fern-200 bg-fern-50 px-4 py-3 text-sm text-fern-800 hover:bg-fern-100"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-fern-600" />
              <span>
                First time here? <span className="font-semibold">Set up the portal</span>
              </span>
            </Link>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          {mode === "pin" && quick ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{quick.name}</p>
                  <p className="truncate text-xs text-slate-500">{quick.email}</p>
                </div>
              </div>
              <PinInput
                value={pin}
                onChange={(v) => {
                  setPin(v);
                  if (v.length === 4) submitPin(v);
                }}
                autoFocus
              />
              <p className="mt-4 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMode("password");
                    setError(null);
                    setEmail(quick.email);
                  }}
                  className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Use password instead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("ledgify.quick");
                    setQuick(null);
                    setMode("password");
                    setError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 hover:underline"
                >
                  Not you?
                </button>
              </p>
              {busy && <p className="mt-3 text-xs text-slate-400">Unlocking…</p>}
            </div>
          ) : (
            <form
              onSubmit={submitPassword}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourfirm.in"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                <LogIn className="h-4 w-4" />
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <Link
                  href="/forgot"
                  className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Forgot password?
                </Link>
                {quick && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("pin");
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Use PIN
                  </button>
                )}
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Tip: after signing in, set a 4-digit PIN from your profile menu for
            quicker access on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
