"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";
import { useResource, apiMutate } from "@/lib/useApi";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Loading } from "@/components/ui/EmptyState";

type ResetInfo = {
  valid: boolean;
  firmName: string | null;
  name?: string;
  email?: string;
};

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data, loading } = useResource<ResetInfo>(
    `/api/auth/reset?token=${encodeURIComponent(token)}`,
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setErr(null);
    try {
      await apiMutate("/api/auth/reset", "POST", { token, password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1400);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not reset the password");
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
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-white">
            {data?.firmName ?? "Reset password"}
          </h1>
          <p className="text-sm text-brand-200/80">Choose a new password</p>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6">
            <Loading label="Checking the link…" />
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-fern-300 bg-fern-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-fern-600" />
            <p className="mt-2 text-sm font-medium text-fern-800">
              Password updated — taking you to sign in…
            </p>
          </div>
        ) : !data?.valid ? (
          <div className="rounded-2xl bg-white p-6 text-center">
            <p className="text-sm font-medium text-slate-800">
              This reset link is invalid or has expired.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Links are valid for 60 minutes and can be used once.
            </p>
            <Link href="/forgot">
              <Button variant="secondary" className="mt-4">
                Request a new link
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-xl">
            {err && (
              <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {err}
              </div>
            )}
            <p className="mb-4 text-sm text-slate-600">
              Setting a new password for{" "}
              <span className="font-medium text-slate-900">{data.email}</span>
            </p>
            <div className="space-y-4">
              <Field label="New password" required hint="At least 6 characters">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </Field>
              <Field
                label="Confirm new password"
                required
                hint={mismatch ? "Passwords don't match yet." : undefined}
              >
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={busy || password.length < 6 || password !== confirm}
            >
              {busy ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-brand-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
