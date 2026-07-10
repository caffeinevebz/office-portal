"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Database, UserPlus, CheckCircle2 } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Loading } from "@/components/ui/EmptyState";

type Status = { needsSetup: boolean };

export default function SetupPage() {
  const router = useRouter();
  const { data, loading } = useResource<Status>("/api/setup/status");
  const [busy, setBusy] = useState<"demo" | "fresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function init(payload: { mode: "demo" } | { mode: "fresh"; name: string; email: string; password: string }) {
    setBusy(payload.mode);
    setError(null);
    try {
      await apiMutate("/api/setup/init", "POST", payload);
      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">
            Portal Setup
          </h1>
          <p className="text-sm text-slate-500">
            One-time initialisation of your office portal
          </p>
        </div>

        {loading ? (
          <Loading label="Checking portal status…" />
        ) : done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-2 text-sm font-medium text-emerald-800">
              Setup complete — taking you to the sign-in page…
            </p>
          </div>
        ) : data && !data.needsSetup ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-600">
              This portal is already initialised.
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Go to sign in →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Database className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Explore with sample data
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Loads a demo firm — clients, compliance tasks, invoices,
                    DSCs and registers — plus the four demo logins shown on the
                    sign-in screen. Best for trying the portal out.
                  </p>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                onClick={() => init({ mode: "demo" })}
                disabled={busy !== null}
              >
                {busy === "demo" ? "Loading sample data…" : "Load sample data"}
              </Button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <UserPlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Start clean for real use
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Creates only your Partner account with full access. You add
                    your own clients and team from inside the portal.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <Field label="Your name" required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CA Your Name" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourfirm.in" />
                </Field>
                <Field label="Password" required hint="Minimum 6 characters">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </Field>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => init({ mode: "fresh", name, email, password })}
                  disabled={busy !== null || !name || !email || password.length < 6}
                >
                  {busy === "fresh" ? "Creating account…" : "Create my Partner account"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
