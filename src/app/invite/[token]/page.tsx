"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, UserPlus, CheckCircle2 } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Loading } from "@/components/ui/EmptyState";

type InviteInfo = {
  valid: boolean;
  firmName: string;
  email?: string;
  name?: string | null;
  role?: string;
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data, loading } = useResource<InviteInfo>(
    `/api/invitations/accept?token=${encodeURIComponent(token)}`,
  );

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Prefill the name once the invite loads.
  const filledName = name || data?.name || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiMutate("/api/invitations/accept", "POST", { token, name: filledName, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate the account");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-900 to-brand-950 px-4 py-10">
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-saffron-500" />
        <span className="flex-1 bg-white" />
        <span className="flex-1 bg-fern-500" />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-white">
            {data?.firmName ?? "Office Portal"}
          </h1>
          <p className="text-sm text-brand-200/80">Team invitation</p>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6">
            <Loading label="Checking invitation…" />
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-fern-300 bg-fern-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-fern-600" />
            <p className="mt-2 text-sm font-medium text-fern-800">
              Account activated — taking you to sign in…
            </p>
          </div>
        ) : !data?.valid ? (
          <div className="rounded-2xl bg-white p-6 text-center">
            <p className="text-sm text-slate-600">
              This invitation is invalid, already used, or has expired.
            </p>
            <Link href="/login" className="mt-3 inline-block text-sm font-medium text-brand-600">
              Go to sign in →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Joining as <strong>{data.role}</strong> · {data.email}
            </div>
            <Field label="Your name" required>
              <Input value={filledName} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
            </Field>
            <Field label="Choose a password" required hint="Minimum 6 characters">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !filledName || password.length < 6}>
              <UserPlus className="h-4 w-4" />
              {busy ? "Activating…" : "Activate my account"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
