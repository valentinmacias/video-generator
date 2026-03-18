"use client";

import { useEffect, useRef, useState } from "react";
import { Brand, GenerateResponse, Video, listBrands, createBrand, getVideo } from "./lib/api";
import { GenerationForm } from "./components/GenerationForm";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, ChevronDown, ChevronUp, Briefcase, Sparkles,
  Upload, Check, Loader2, ExternalLink, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

// ── Generating toast ──────────────────────────────────────────────────────────

function GeneratingToast({
  ids,
  onDone,
}: {
  ids: string[];
  onDone: (id: string) => void;
}) {
  const [statuses, setStatuses] = useState<Record<string, Video["status"]>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;
    const active = ids.filter((id) => !["COMPLETED", "FAILED"].includes(statuses[id] ?? ""));
    if (active.length === 0) return;

    pollRef.current = setInterval(async () => {
      await Promise.all(
        active.map(async (id) => {
          try {
            const v = await getVideo(id);
            setStatuses((prev) => ({ ...prev, [id]: v.status }));
            if (v.status === "COMPLETED" || v.status === "FAILED") {
              onDone(id);
            }
          } catch {}
        }),
      );
    }, 6000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  if (ids.length === 0) return null;

  const doneCount = ids.filter((id) => statuses[id] === "COMPLETED" || statuses[id] === "FAILED").length;
  const activeCount = ids.length - doneCount;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {activeCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-tt-accent/30 bg-tt-card/95 backdrop-blur px-4 py-3 shadow-card-hover">
          <div className="h-4 w-4 rounded-full border-2 border-tt-accent border-t-transparent animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-tt-text">
              {activeCount} video{activeCount !== 1 ? "s" : ""} generating…
            </p>
            <p className="text-[10px] text-tt-muted">⚡ Runway Gen-4 Turbo</p>
          </div>
          <Link
            href="/library"
            className="ml-2 flex items-center gap-1 rounded-lg border border-tt-accent/30 bg-tt-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-tt-accent hover:bg-tt-accent/20 transition-all"
          >
            View <ExternalLink size={10} />
          </Link>
        </div>
      )}
      {doneCount > 0 && activeCount === 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-tt-card/95 backdrop-blur px-4 py-3 shadow-card-hover">
          <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
          <p className="text-xs font-bold text-tt-text">
            {doneCount} video{doneCount !== 1 ? "s" : ""} ready
          </p>
          <Link
            href="/library"
            className="ml-2 flex items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-green-400 hover:bg-green-500/20 transition-all"
          >
            View <ExternalLink size={10} />
          </Link>
        </div>
      )}
    </div>
  );
}

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
  const [toastIds, setToastIds]           = useState<string[]>([]);

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
    setToastIds((prev) => [...new Set([...prev, ...ids])]);
    // Safety-net: clear after 15 min regardless
    setTimeout(() => setToastIds((prev) => prev.filter((id) => !ids.includes(id))), 15 * 60 * 1000);
  }

  function handleToastDone(id: string) {
    // Leave it visible briefly in "ready" state, then clear after 5 s
    setTimeout(() => setToastIds((prev) => prev.filter((i) => i !== id)), 5000);
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

      {/* Generating / ready toast (bottom-right) */}
      <GeneratingToast ids={toastIds} onDone={handleToastDone} />
    </div>
  );
}
