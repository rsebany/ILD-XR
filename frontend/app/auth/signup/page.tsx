"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Lock, User, ArrowLeft, ChevronDown, Loader2, CheckCircle2, Shield } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { AuthPage } from "@/components/features/auth/AuthPage";
import type { UserRole } from "@/api/domain";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "radiologist", label: "Radiologist / Pulmonologist" },
  { value: "referring_physician", label: "Referring Physician" },
];

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("radiologist");
  const [password, setPassword] = useState("");
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signup, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  const selectedRoleLabel = ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await signup(fullName, email, role, password);
    } catch (err: unknown) {
      setError(
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Registration failed"
          : "Registration failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPage
      leftContent={null}
    >
      <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
            <p className="mt-2 text-muted-foreground">
              Provide your professional details to get started. Fields marked{" "}
              <span className="font-semibold text-red-500">*</span> are required.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Full Professional Name{" "}
                <span className="text-red-500" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  required
                  aria-required="true"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-12 w-full rounded-[10px] border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
                  placeholder="Dr. Romualdo SEBANY"
                />
              </div>
            </div>

            <div className="space-y-1.5">
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
                  placeholder="romualdo.sebany@clinic.dz"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Clinical Role{" "}
                <span className="text-red-500" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRoleDropdownOpen((v) => !v)}
                  onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 150)}
                  className="flex h-12 w-full items-center justify-between rounded-[10px] border border-border bg-card px-4 text-left text-sm text-foreground transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/60"
                >
                  <span>{selectedRoleLabel}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${roleDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {roleDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-2 overflow-hidden rounded-[10px] border border-border bg-card shadow-2xl backdrop-blur-xl">
                    {ROLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setRole(opt.value);
                          setRoleDropdownOpen(false);
                        }}
                        className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                          role === opt.value ? "bg-muted text-sky-500" : "text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-[10px] border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/60 transition-all"
                  placeholder="Min. 8 characters"
                />
              </div>
            </div>

            <button
            type="submit"
            disabled={isSubmitting}
            className="group relative mt-6 flex h-12 w-full items-center justify-center overflow-hidden rounded-[999px] bg-primary font-bold text-white transition-all hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70 shadow-[0_4px_18px_rgba(2,132,199,0.4)]"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <span className="relative z-10">Create Medical Account</span>
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform group-hover:translate-x-full duration-1000" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-border pt-8 text-center">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="font-bold text-sky-500 hover:text-sky-400 transition-colors">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </AuthPage>
  );
}