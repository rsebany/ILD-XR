"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function LandingHero() {
  return (
    <section className="mx-auto max-w-4xl px-6 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 text-5xl font-extrabold text-white md:text-6xl"
      >
        <span className="text-sky-400">ILD-XR</span>
        <span className="mt-3 block text-3xl font-bold tracking-tight md:text-4xl">
          Patient-level hierarchical 3D ILD analysis
        </span>
      </motion.h1>
      <p className="mb-10 text-lg text-slate-400">
        Lungmask preprocessing, a MedicalNet-initialized hierarchical Softmax
        cascade, volumetric biomarkers, and browser-native WebXR review in one
        open clinical workflow.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href="/auth/signup"
          className="rounded-lg bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-[0_4px_18px_rgba(2,132,199,0.35)] transition hover:bg-sky-500"
        >
          Enter Platform
        </Link>
      </div>
    </section>
  );
}
