"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, Scan, Brain, Boxes, Activity, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { AppLogo } from "@/components/app-logo";
import { FeatureCard } from "@/components/ui/FeatureCard";

export default function LandingPage() {
  const scrollToFeatures = () => {
    const featuresSection = document.getElementById("features");
    featuresSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1] as const,
        when: "beforeChildren" as const,
        staggerChildren: 0.12,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Background Layer */}
      <div
        className="fixed inset-0 z-0 bg-[url('/assets/background.png')] bg-cover bg-center bg-no-repeat"
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-[1] bg-black/65"
        aria-hidden="true"
      />
      
      {/* Content Overlay */}
      <div className="relative z-10 min-h-dvh bg-gradient-to-b from-black/20 via-black/60 to-background">
        
        {/* Navigation */}
        <nav className="fixed top-0 z-50 w-full">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <AppLogo size={32} className="h-9 w-9" priority />
              <span className="truncate text-lg font-bold tracking-tight sm:text-xl">ILD-XR</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <Link
                href="/auth/login"
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] sm:px-5 sm:py-2 sm:text-sm"
              >
                Get Started
              </Link>
            </div>
          </div>
        </nav>

        <main className="pt-24 sm:pt-28 md:pt-32">
          {/* Hero Section */}
          <motion.section
            className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20"
            initial="hidden"
            animate="show"
            variants={sectionVariants}
          >
            <motion.h1 variants={itemVariants} className="mb-6 bg-gradient-to-r from-white to-white/60 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl md:text-7xl">
              Diagnose ILD faster <br /> from one platform
            </motion.h1>
            <motion.p variants={itemVariants} className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:mb-10 sm:text-lg md:text-xl">
              Upload scans, run AI segmentation, and review results in 2D, 3D, and XR. Fully web-based with no specialized client hardware.
            </motion.p>
            <motion.div variants={itemVariants} className="flex flex-col items-center justify-center gap-4">
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/auth/signup"
                  className="group inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-bold text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95"
                >
                  Try Live Demo
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <button
                  type="button"
                  onClick={scrollToFeatures}
                  className="inline-flex h-14 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-8 text-base font-medium backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Explore Features
                </button>
              </div>
              <button
                type="button"
                onClick={scrollToFeatures}
                aria-label="Scroll to features"
                className="mt-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10 hover:text-white"
              >
                <ChevronDown className="h-5 w-5 animate-bounce" />
              </button>
            </motion.div>
          </motion.section>

          {/* Features Grid */}
          <motion.section
            id="features"
            className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 sm:px-6 sm:py-20 md:py-24"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={sectionVariants}
          >
            <motion.div variants={itemVariants} className="grid gap-6 md:grid-cols-3">
              <motion.div variants={itemVariants} className="transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]">
              <FeatureCard 
                icon={<Brain className="h-6 w-6 text-blue-400" />}
                title="Auto 3D Segmentation"
                description="Turn HRCT into multi-class segmentation in minutes with consistent, objective output."
              />
              </motion.div>
              <motion.div variants={itemVariants} className="transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]">
              <FeatureCard 
                icon={<Boxes className="h-6 w-6 text-purple-400" />}
                title="Web + XR Viewer"
                description="Go from slices to immersive 3D review in one smooth browser experience."
              />
              </motion.div>
              <motion.div variants={itemVariants} className="transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]">
              <FeatureCard 
                icon={<Scan className="h-6 w-6 text-emerald-400" />}
                title="Longitudinal Tracking"
                description="Track disease burden over time and support faster, data-driven follow-up decisions."
              />
              </motion.div>
            </motion.div>
          </motion.section>

          {/* Motivations */}
          <motion.section
            className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={sectionVariants}
          >
            <motion.div variants={itemVariants} className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Why Teams Need This</h2>
              <p className="mx-auto mt-3 max-w-3xl text-muted-foreground">
                ILD-XR targets the main workflow gaps that slow diagnosis and limit consistency in routine practice.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-2">
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                High manual workload in HRCT interpretation increases latency and inter-reader variability.
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                Few usable systems can segment multiple ILD patterns in one automated pipeline.
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                Volumetric disease-burden quantification is still limited in standard reporting.
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                XR has strong potential for spatial understanding but remains underused in clinical flow.
              </motion.div>
            </motion.div>
          </motion.section>

          {/* Core Contributions */}
          <motion.section
            className="mx-auto max-w-7xl px-4 py-8 sm:px-6"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={sectionVariants}
          >
            <motion.div variants={itemVariants} className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What ILD-XR Delivers</h2>
              <p className="mx-auto mt-3 max-w-3xl text-muted-foreground">
                End-to-end capabilities designed for practical deployment and measurable clinical utility.
              </p>
            </motion.div>
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                <h3 className="mb-2 text-base font-semibold">Multi-class 3D Pipeline</h3>
                <p className="text-sm text-muted-foreground">Residual U-Net for GGO, Reticulation, and Consolidation in one inference pass.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                <h3 className="mb-2 text-base font-semibold">Quantitative Evaluation</h3>
                <p className="text-sm text-muted-foreground">Strong benchmark results with class-wise analysis and clear failure-case visibility.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                <h3 className="mb-2 text-base font-semibold">Clinical Biomarkers</h3>
                <p className="text-sm text-muted-foreground">Automated lesion volume, ILD burden, and regional distribution across lung zones.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                <h3 className="mb-2 text-base font-semibold">Immersive 3D Review</h3>
                <p className="text-sm text-muted-foreground">Marching Cubes mesh reconstruction combined with interactive WebXR exploration.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 md:col-span-2">
                <h3 className="mb-2 text-base font-semibold">Deployable Full-Stack Platform</h3>
                <p className="text-sm text-muted-foreground">FastAPI + PostgreSQL + Next.js/Three.js workflow from DICOM ingestion to 2D/3D clinical visualization.</p>
              </motion.div>
            </motion.div>
          </motion.section>

          {/* Project Impact */}
          <motion.section
            className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={sectionVariants}
          >
            <motion.div variants={itemVariants} className="mb-8 text-center">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Impact at a Glance</h2>
            </motion.div>
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
              <motion.div variants={itemVariants} className="rounded-xl border border-blue-400/20 bg-blue-500/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300/40">
                <h3 className="mb-2 text-base font-semibold text-blue-300">Technical</h3>
                <p className="text-sm text-muted-foreground">Demonstrates unified web integration of multi-class volumetric segmentation and XR visualization.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/40">
                <h3 className="mb-2 text-base font-semibold text-emerald-300">Clinical</h3>
                <p className="text-sm text-muted-foreground">Supports faster workflows, better consistency across readers, and objective longitudinal follow-up.</p>
              </motion.div>
              <motion.div variants={itemVariants} className="rounded-xl border border-purple-400/20 bg-purple-500/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-purple-300/40">
                <h3 className="mb-2 text-base font-semibold text-purple-300">Societal</h3>
                <p className="text-sm text-muted-foreground">Web deployment without specialized hardware lowers adoption barriers in constrained settings.</p>
              </motion.div>
            </motion.div>
          </motion.section>
        </main>

        {/* Footer */}
        <footer className="mt-20 border-t border-white/5 bg-black/40 py-12 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
              <div className="flex items-center gap-2 opacity-80">
                <AppLogo size={24} />
                <span className="font-semibold text-white">ILD-XR</span> by Romualdo SEBANY
              </div>
              <p className="text-sm text-muted-foreground">
                © 2026 ILD-XR Project. Built for medical innovation. All rights reserved.
              </p>
              <div className="flex gap-4 text-xs font-medium text-muted-foreground uppercase tracking-widest">
                <span>Privacy</span>
                <span>Terms</span>
                <span>Contact</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

