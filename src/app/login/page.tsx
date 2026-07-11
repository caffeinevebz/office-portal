"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, LogIn, Sparkles } from "lucide-react";
import { useResource } from "@/lib/useApi";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

const DEMO = [
  { label: "Partner", email: "rajesh@sharmaassociates.in", password: "partner@123" },
  { label: "Manager", email: "priya@sharmaassociates.in", password: "manager@123" },
  { label: "Accountant", email: "amit@sharmaassociates.in", password: "staff@123" },
  { label: "Article Asst.", email: "sneha@sharmaassociates.in", password: "staff@123" },
];

type Branding = { name: string; tagline: string; hasLogo: boolean };

export default function LoginPage() {
  const router = useRouter();
  const { data: setup } = useResource<{ needsSetup: boolean }>("/api/setup/status");
  const { data: branding } = useResource<Branding>("/api/branding");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the browser tab in sync with the firm the portal is branded for.
  useEffect(() => {
    document.title = branding?.name ? `${APP_NAME} · ${branding.name}` : APP_NAME;
  }, [branding?.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Login failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-900 to-brand-950 px-4 py-10">
      {/* tricolour accent bar */}
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-saffron-500" />
        <span className="flex-1 bg-white" />
        <span className="flex-1 bg-fern-500" />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {branding?.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/branding/logo"
              alt=""
              className="h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow-lg ring-1 ring-white/20"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg ring-1 ring-white/20">
              <Building2 className="h-8 w-8" />
            </div>
          )}
          <h1 className="mt-4 text-xl font-semibold text-white">
            {branding?.name ?? APP_NAME}
          </h1>
          <p className="text-sm text-brand-200/80">
            {branding?.tagline ?? ""} · sign in to continue
          </p>
        </div>

        {setup?.needsSetup && (
          <Link
            href="/setup"
            className="mb-4 flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700 hover:bg-brand-100"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>
              <strong>First run?</strong> This portal has no accounts yet —
              initialise it here.
            </span>
          </Link>
        )}

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@sharmaassociates.in"
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
          <p className="text-center">
            <Link
              href="/forgot"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        </form>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-medium text-brand-200/80">
            Demo accounts — click to fill
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                  setError(null);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white transition-colors hover:border-saffron-400/50 hover:bg-white/10"
              >
                <span className="block font-medium">{d.label}</span>
                <span className="block truncate text-brand-200/70">{d.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
