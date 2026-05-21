"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { notify } from "@/lib/notify";
import { AuthPage } from "@/components/features/auth/AuthPage";
import { AppLogo } from "@/components/app-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
      notify.success("Signed in successfully");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string | string[] } }; message?: string };
      const detail = axiosErr.response?.data?.detail;
      const message = typeof detail === "string"
        ? detail
        : Array.isArray(detail) && detail.length > 0
          ? String(detail[0])
          : axiosErr.response
            ? "Invalid email or password"
            : "Connection failed. Ensure the backend API is running and reachable.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage
      leftContent={null}
    >
      <div className="mb-10 lg:hidden">
        <AppLogo size={48} className="mx-auto h-12 w-12 object-contain" />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Welcome Back</h1>
        <p className="mt-2 text-muted-foreground">
          Enter your institutional credentials to continue. All fields marked{" "}
          <span className="font-semibold text-red-500">*</span> are required.
        </p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Institutional Email{" "}
            <span className="text-red-500" aria-hidden="true">
              *
            </span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              required
              aria-required="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-[10px] border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
              placeholder="name@hospital.dz"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="ml-1 flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Password{" "}
              <span className="text-red-500" aria-hidden="true">
                *
              </span>
            </label>
            <Link href="/auth/forgot-password" title="Recover your password" className="text-xs font-bold text-sky-500 hover:text-sky-400 uppercase tracking-wider">
              FORGOT?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              required
              aria-required="true"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-[10px] border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <input
            type="checkbox"
            id="remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary"
          />
          <label htmlFor="remember" className="text-xs text-muted-foreground">
            Keep me logged in for the duration of my shift
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="group relative mt-4 flex h-12 w-full items-center justify-center overflow-hidden rounded-[999px] bg-primary font-bold text-white transition-all hover:bg-sky-500 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_4px_18px_rgba(2,132,199,0.4)]"
        >
          {isSubmitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span className="relative z-10">Sign in to Dashboard</span>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform group-hover:translate-x-full duration-1000" />
            </>
          )}
        </button>
      </form>

      <div className="mt-8 border-t border-border pt-8 text-center lg:text-left">
        <p className="text-xs text-muted-foreground">
          New to the platform?
          <Link
            href="/auth/signup"
            className="ml-2 font-bold text-sky-500 hover:text-sky-400 transition-colors"
          >
            Request Access Credentials
          </Link>
        </p>
      </div>
    </AuthPage>
  );
}
