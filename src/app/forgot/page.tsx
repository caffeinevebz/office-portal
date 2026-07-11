"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, ArrowLeft, MailCheck } from "lucide-react";
import { apiMutate } from "@/lib/useApi";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiMutate("/api/auth/forgot", "POST", { email })) as {
        message: string;
      };
      setSent(res.message);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-900 to-brand-950 px-4 py-10">
      <div className="absolute inset-x-0 top-0 flex h-1">
        <span className="flex-1 bg-fern-400" />
        <span className="flex-1 bg-fern-200" />
        <span className="flex-1 bg-brand-500" />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-white">Forgot your password?</h1>
          <p className="text-sm text-brand-200/80">
            We&apos;ll email you a link to set a new one
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-fern-300 bg-fern-50 p-6 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-fern-600" />
            <p className="mt-2 text-sm text-fern-800">{sent}</p>
            <p className="mt-2 text-xs text-fern-700/80">
              Check your inbox (and spam folder). The link expires in 60 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-xl">
            {err && (
              <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {err}
              </div>
            )}
            <Field label="Your work email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourfirm.in"
                autoFocus
              />
            </Field>
            <Button type="submit" className="mt-4 w-full" disabled={busy || !email}>
              {busy ? "Sending…" : "Email me a reset link"}
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
