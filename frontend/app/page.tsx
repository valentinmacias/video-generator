"use client";

import { useEffect, useState } from "react";
import { Brand, GenerateResponse, listBrands, createBrand } from "./lib/api";
import { GenerationForm } from "./components/GenerationForm";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, ChevronDown, ChevronUp, Briefcase, Sparkles,
  Upload, Check, Loader2,
} from "lucide-react";
import { clsx } from "clsx";

// ── Brand panel (collapsible) ─────────────────────────────────────────────────

function BrandPanel({
  brands,
  onBrandCreated,
}: {
  brands: Brand[];
  onBrandCreated: (b: Brand) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState("");
  const [guide, setGuide]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true); setError(null);
    try {
      const brand = await createBrand(name, guide);
      onBrandCreated(brand);
      setName(""); setGuide(""); setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-tt-border bg-tt-surface/80 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-3 text-sm"
      >
        <div className="flex items-center gap-2 text-tt-muted hover:text-tt-text transition-colors">
          <Briefcase size={15} />
          <span className="font-semibold">
            {brands.length ? `${brands.length} brand${brands.length !== 1 ? "s" : ""}` : "No brands yet"} — Manage
          </span>
        </div>
        {open ? <ChevronUp size={15} className="text-tt-muted" /> : <ChevronDown size={15} className="text-tt-muted" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 space-y-4">
              {/* Existing brands */}
              {brands.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 rounded-full border border-tt-border bg-tt-card px-3 py-1.5">
                      <div className="h-2 w-2 rounded-full bg-tt-accent" />
                      <span className="text-xs font-semibold text-tt-text">{b.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Create brand form */}
              <div className="rounded-xl border border-tt-border bg-tt-card p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-tt-muted">Create New Brand</p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Brand name"
                  className="w-full rounded-xl border border-tt-border bg-tt-surface px-3 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none transition-all"
                />
                <textarea
                  value={guide}
                  onChange={(e) => setGuide(e.target.value)}
                  placeholder="Style guide (colors, tone, audience…)"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-tt-border bg-tt-surface px-3 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none transition-all"
                />
                {error && <p className="text-xs text-red-300">{error}</p>}
                <button
                  onClick={handleCreate}
                  disabled={loading || !name.trim()}
                  className="btn-accent flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  {done ? <><Check size={15} /> Created!</> : loading ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : <><Plus size={15} /> Create Brand</>}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [brands, setBrands]               = useState<Brand[]>([]);
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

  function handleVideoGenerated(response: GenerateResponse) {
    const ids = response.video_ids?.length ? response.video_ids : [response.video_id];
    setPendingVideoIds((prev) => [...prev, ...ids]);
    setTimeout(() => {
      setPendingVideoIds((prev) => prev.filter((id) => !ids.includes(id)));
    }, 10 * 60 * 1000);
  }

  return (
    <div className="flex h-screen flex-col bg-tt-bg">
      {/* Brand panel (top, collapsible) */}
      {!loadingBrands && (
        <BrandPanel brands={brands} onBrandCreated={handleBrandCreated} />
      )}

      {/* Generation pipeline — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        {loadingBrands ? (
          <div className="flex h-full items-center justify-center gap-3 text-tt-muted">
            <Loader2 size={20} className="animate-spin text-tt-accent" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <GenerationForm brands={brands} onGenerated={handleVideoGenerated} />
        )}
      </div>
    </div>
  );
}
