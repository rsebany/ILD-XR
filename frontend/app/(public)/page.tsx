/**
 * Public landing page — research positioning, pipeline overview, and sign-up CTAs.
 */
"use client";

import {
  LandingHero,
  LandingImpact,
  LandingNav,
  LandingPipeline,
} from "@/components/features/landing";

export default function ResearchLandingPage() {
  return (
    <div className="dark min-h-screen bg-background font-sans text-slate-200 selection:bg-primary/30">
      <div
        className="fixed inset-0 z-0 bg-[url('/assets/background.png')] bg-cover bg-center bg-no-repeat"
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[1] bg-black/65" aria-hidden="true" />

      <div className="relative z-10 min-h-dvh bg-gradient-to-b from-black/20 via-black/60 to-background">
        <LandingNav />
        <main className="pb-20 pt-32">
          <LandingHero />
          <LandingPipeline />
          <LandingImpact />
        </main>

        <footer className="mt-12 border-t border-white/10 bg-black/40 py-10 text-center text-sm text-slate-500 backdrop-blur-md">
          <p>© 2026 Romualdo SEBANY · AI Research Intern @ CDTA</p>
          <p className="mt-2 text-xs">
            This project is dedicated to the advancement of clinical AI research
            and does not constitute medical advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
