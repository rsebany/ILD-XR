"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowLeft, KeyRound, Loader2, CheckCircle, ShieldAlert } from "lucide-react";
import { resetPassword } from "@/lib/auth";
import { AuthPage } from "@/components/features/auth/AuthPage";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();

  const loadToken = useCallback(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset link.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Reset failed"
          : "Reset failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage
      leftContent={null}
    >
      <div className="w-full max-w-sm">
        {success ? (
          <div className="space-y-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Password Updated</h1>
              <p className="mt-3 text-slate-500 leading-relaxed">
                Credentials reset successfully. Use your new password to sign in.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-sky-600 font-bold text-white hover:bg-sky-500 transition-all shadow-[0_4px_15px_rgba(14,165,233,0.3)]"
            >
              Sign In
            </Link>
          </div>
        ) : !token ? (
          <div className="space-y-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Expired Link</h1>
              <p className="mt-3 text-slate-500 leading-relaxed">
                This reset link is no longer valid.
              </p>
            </div>
            <Link
              href="/auth/forgot-password"
              className="flex h-12 w-full items-center justify-center rounded-xl bg_WHITE/5 border border_WHITE/10 font-bold text_WHITE hover:bg_WHITE/10 transition-all"
            >
              Request New Link
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-10">
              <h1 className="text-3xl font-bold text_WHITE">New Password</h1>
              <p className="mt-2 text-slate-500">Update your account credentials.</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Password{" "}
                  <span className="text-red-400" aria-hidden="true">
                    *
                  </span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    aria-required="true"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full border-b border-white/10 bg-transparent pl-10 pr-4 text-sm text_WHITE placeholder:text-slate-600 focus:border-sky-500 focus:outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Confirm{" "}
                  <span className="text-red-400" aria-hidden="true">
                    *
                  </span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    aria-required="true"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 w-full border-b border-white/10 bg-transparent pl-10 pr-4 text-sm text_WHITE placeholder:text-slate-600 focus:border-sky-500 focus:outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative mt-4 flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-sky-600 font-bold text_WHITE transition-all hover:bg-sky-500 disabled:opacity-70 shadow-[0_4px_20px_rgba(14,165,233,0.3)]"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Changes"}
              </button>
            </form>
          </>
        )}

        {!success && token && (
          <div className="mt-12 text-center lg:text-left">
            <Link href="/auth/login" className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-sky-400 transition-colors">
              Cancel and return
            </Link>
          </div>
        )}
      </div>
    </AuthPage>
  );
}
