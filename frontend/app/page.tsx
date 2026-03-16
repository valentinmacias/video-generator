"use client";

import { useEffect, useState } from "react";
import { Brand, GenerateResponse, listBrands } from "./lib/api";
import { BrandDashboard } from "./components/BrandDashboard";
import { VideoGenerator } from "./components/VideoGenerator";
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
    setPendingVideoIds((prev) => [...prev, response.video_id]);
    // Remove from pending after 10 min (safety cleanup)
    setTimeout(() => {
      setPendingVideoIds((prev) => prev.filter((id) => id !== response.video_id));
    }, 10 * 60 * 1000);
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-surface-border bg-surface-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Film className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">
                Video Brand Generator
              </h1>
              <p className="text-xs text-surface-muted hidden sm:block">
                Powered by Google Veo 3.1
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-surface-muted">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Gemini-enhanced prompts</span>
          </div>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sidebar: Brand + Generator */}
          <div className="lg:col-span-1 space-y-6">
            {loadingBrands ? (
              <div className="rounded-xl bg-surface-card border border-surface-border p-6 space-y-3">
                <div className="h-5 w-40 skeleton rounded" />
                <div className="h-4 w-full skeleton rounded" />
                <div className="h-4 w-3/4 skeleton rounded" />
              </div>
            ) : (
              <BrandDashboard
                brands={brands}
                onBrandCreated={handleBrandCreated}
                onBrandUpdated={handleBrandUpdated}
              />
            )}

            <VideoGenerator
              brands={brands}
              onGenerated={handleVideoGenerated}
            />

            {/* Info card */}
            <div className="rounded-xl bg-gradient-to-br from-brand-900/40 to-purple-900/40 border border-brand-700/30 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-brand-300">How it works</h3>
              <ol className="text-xs text-slate-400 space-y-1.5 list-none">
                {[
                  "Create a brand & upload reference images",
                  "Enter a simple prompt for your video",
                  "Gemini expands it into a cinematic prompt",
                  "Veo 3.1 generates a 1080p video (2–5 min)",
                  "Your video appears in the gallery below",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-brand-700/60 text-brand-300 text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right: Gallery */}
          <div className="lg:col-span-2">
            <VideoGallery pendingIds={pendingVideoIds} />
          </div>
        </div>
      </main>
    </div>
  );
}
