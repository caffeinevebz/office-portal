"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

const DEMO = [
  { label: "Partner", email: "rajesh@sharmaassociates.in", password: "partner@123" },
  { label: "Manager", email: "priya@sharmaassociates.in", password: "manager@123" },
  { label: "Accountant", email: "amit@sharmaassociates.in", password: "staff@123" },
  { label: "Article Asst.", email: "sneha@sharmaassociates.in", password: "staff@123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">
            Sharma &amp; Associates
          </h1>
          <p className="text-sm text-slate-500">Office Portal · sign in to continue</p>
        </div>

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
        </form>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white/60 p-4">
          <p className="mb-2 text-xs font-medium text-slate-500">
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
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50"
              >
                <span className="block font-medium text-slate-700">{d.label}</span>
                <span className="block truncate text-slate-400">{d.password}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
