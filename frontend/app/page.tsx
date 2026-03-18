"use client";

import { useEffect, useState } from "react";
import { Brand, GenerateResponse, listBrands } from "./lib/api";
import { BrandDashboard } from "./components/BrandDashboard";
import { GenerationForm } from "./components/GenerationForm";
import { VideoGallery } from "./components/VideoGallery";
import { Film, Zap } from "lucide-react";

export default function HomePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [pendingVideoIds, setPendingVideoIds] = useState<string[]>([]);

  useEffect(() => {
    listBrands()
      .then(setBrands)
      .catch(console.error)
      .finally(() => setLoadingBrands(false));
  }, []);

  function handleBrandCreated(brand: Brand) {
    setBrands((prev) => [brand, ...prev]);
  }

  function handleBrandUpdated(updated: Brand) {
    setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  function handleVideoGenerated(response: GenerateResponse) {
    // Track all generated asset IDs (covers both single video and multi-image batches)
    const ids = response.video_ids?.length ? response.video_ids : [response.video_id];
    setPendingVideoIds((prev) => [...prev, ...ids]);
    // Safety cleanup after 10 min
    setTimeout(() => {
      setPendingVideoIds((prev) => prev.filter((id) => !ids.includes(id)));
    }, 10 * 60 * 1000);
  }

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-surface-border bg-surface-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-purple-600">
              <Film className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">
                Video Brand Generator
              </h1>
              <p className="hidden text-xs text-surface-muted sm:block">
                Powered by Google Veo + Imagen + Gemini
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-surface-muted">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">AI-enhanced prompts</span>
          </div>
        </div>
      </header>

      {/* ── Main layout ──────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* ── Left column: Brand dashboard ──────────────────────────────── */}
          <div className="space-y-6 lg:col-span-1">
            {loadingBrands ? (
              <div className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-6">
                <div className="skeleton h-5 w-40 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-3/4 rounded" />
              </div>
            ) : (
              <BrandDashboard
                brands={brands}
                onBrandCreated={handleBrandCreated}
                onBrandUpdated={handleBrandUpdated}
              />
            )}

            {/* How it works */}
            <div className="rounded-xl border border-brand-700/30 bg-gradient-to-br from-brand-900/40 to-purple-900/40 p-4">
              <h3 className="mb-2 text-sm font-semibold text-brand-300">How it works</h3>
              <ol className="list-none space-y-1.5 text-xs text-slate-400">
                {[
                  "Create a brand & upload reference images",
                  "Choose Video or Image mode",
                  "Tune parameters to match your vision",
                  "Gemini expands your prompt cinematically",
                  "Veo or Imagen generates your asset",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-700/60 text-[10px] font-bold text-brand-300">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* ── Right 2 columns: Generation form + Gallery ────────────────── */}
          <div className="space-y-6 lg:col-span-2">
            <GenerationForm brands={brands} onGenerated={handleVideoGenerated} />
            <VideoGallery pendingIds={pendingVideoIds} />
          </div>

        </div>
      </main>
    </div>
  );
}
