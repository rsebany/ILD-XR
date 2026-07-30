"use client";

import { WORKFLOW_STEPS } from "./landing-data";

export function LandingPipeline() {
  return (
    <section className="mx-auto mt-24 max-w-6xl px-6">
      <h2 className="mb-16 text-center text-3xl font-bold text-white">
        Hierarchical Pipeline
      </h2>
      <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {WORKFLOW_STEPS.map((step) => (
          <div key={step.step} className="border-l border-white/10 pl-6">
            <span className="font-mono text-sm text-sky-500">{step.step}</span>
            <h3 className="mb-2 mt-1 text-lg font-semibold text-white">
              {step.title}
            </h3>
            <p className="text-sm text-slate-400">{step.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
