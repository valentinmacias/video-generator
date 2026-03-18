"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film, ImageIcon, Play, Download, RotateCcw, Loader2,
  CheckCircle2, XCircle, Clock, Sparkles, Search,
} from "lucide-react";
import { clsx } from "clsx";
import { listBrands, listVideos, Video, Brand } from "../lib/api";

type LibTab = "videos" | "images";

const STATUS_MAP = {
  COMPLETED: { label: "Completed", color: "text-tt-accent bg-tt-accent/10 border-tt-accent/20", icon: CheckCircle2 },
  PROCESSING: { label: "Processing", color: "text-blue-300 bg-blue-500/10 border-blue-500/20",   icon: Loader2 },
  PENDING:    { label: "Pending",    color: "text-tt-muted bg-tt-border/50 border-tt-border",     icon: Clock },
  FAILED:     { label: "Failed",     color: "text-red-300 bg-red-500/10 border-red-500/20",        icon: XCircle },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LibraryPage() {
  const [tab, setTab]       = useState<LibTab>("videos");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    listBrands().then(setBrands).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    listVideos(brandId || undefined, 50)
      .then(setVideos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [brandId]);

  // Auto-refresh while processing
  useEffect(() => {
    const hasProcessing = videos.some((v) => v.status === "PROCESSING" || v.status === "PENDING");
    if (!hasProcessing) return;
    const t = setInterval(() => {
      listVideos(brandId || undefined, 50).then(setVideos).catch(console.error);
    }, 6000);
    return () => clearInterval(t);
  }, [videos, brandId]);

  // Refresh when the user returns to this tab (e.g. after generating on home page)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        listVideos(brandId || undefined, 50).then(setVideos).catch(console.error);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [brandId]);

  const isImage  = (v: Video) => v.mode === "image";
  const filtered = videos
    .filter((v) => (tab === "images" ? isImage(v) : !isImage(v)))
    .filter((v) => !search || v.user_prompt?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-screen bg-tt-bg">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-tt-border bg-tt-surface/80 backdrop-blur px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-tt-text">Library</h1>
            <p className="text-xs text-tt-muted mt-0.5">All your AI generations</p>
          </div>

          {/* Brand filter */}
          <select
            value={brandId ?? ""}
            onChange={(e) => setBrandId(e.target.value || undefined)}
            className="rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text focus:border-tt-accent/50 focus:outline-none transition-all"
          >
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-1 rounded-xl bg-tt-card border border-tt-border p-1 w-fit">
          {([["videos", Film, "Video Generations"], ["images", ImageIcon, "Image Generations"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                tab === key
                  ? "bg-tt-accent/15 text-tt-accent"
                  : "text-tt-muted hover:text-tt-text"
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tt-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by prompt…"
            className="w-full rounded-xl border border-tt-border bg-tt-card pl-10 pr-4 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
          />
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="skeleton aspect-video rounded-xl" />
                <div className="skeleton h-4 w-3/4 rounded-lg" />
                <div className="skeleton h-3 w-1/2 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-tt-muted">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-tt-border bg-tt-card">
              <Sparkles size={24} className="text-tt-accent/50" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-tt-text">No {tab} yet</p>
              <p className="text-xs mt-1">
                {search ? "Try a different search term" : `Generate your first ${tab === "videos" ? "video" : "image"} to see it here`}
              </p>
            </div>
            {!search && (
              <a
                href="/"
                className="btn-accent flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
              >
                <Film size={15} /> Start Creating
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((video, i) => (
              <LibraryCard
                key={video.id}
                video={video}
                index={i}
                playing={playing === video.id}
                onPlay={() => setPlaying(playing === video.id ? null : video.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* TikTok-style inspiration banner */}
      <div className="border-t border-tt-border bg-tt-surface/80 backdrop-blur px-6 py-4">
        <div className="flex items-center gap-3 rounded-xl border border-tt-accent/20 bg-gradient-to-r from-tt-accent/5 via-tt-blue/5 to-tt-purple/5 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-tt-accent/20 to-tt-blue/20">
            <Sparkles size={16} className="text-tt-accent" />
          </div>
          <div>
            <p className="text-xs font-semibold text-tt-text">Get inspired by trending content</p>
            <p className="text-[11px] text-tt-muted">Discover what works best for your brand on TikTok</p>
          </div>
          <button className="ml-auto rounded-lg border border-tt-accent/30 bg-tt-accent/10 px-3 py-1.5 text-xs font-semibold text-tt-accent hover:bg-tt-accent/20 transition-all">
            Explore Trends →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Library card ──────────────────────────────────────────────────────────────

function LibraryCard({ video, index, playing, onPlay }: {
  video: Video; index: number; playing: boolean; onPlay: () => void;
}) {
  const cfg = STATUS_MAP[video.status];
  const StatusIcon = cfg.icon;
  const isImg = video.mode === "image";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group overflow-hidden rounded-2xl border border-tt-border bg-tt-card transition-all duration-300 hover:border-tt-accent/40 hover:shadow-card-hover"
    >
      {/* Media area */}
      <div className="relative aspect-video overflow-hidden bg-tt-surface">
        {isImg && video.image_url ? (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : video.status === "COMPLETED" && video.video_url ? (
          playing ? (
            <video src={video.video_url} autoPlay controls className="h-full w-full object-cover" onEnded={onPlay} />
          ) : (
            <div
              className="relative h-full w-full cursor-pointer"
              onClick={onPlay}
            >
              {video.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-tt-card to-tt-surface" />
              )}
              <div className="absolute inset-0 image-card-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
                  <Play size={18} className="ml-0.5 text-white" />
                </div>
              </div>
            </div>
          )
        ) : video.status === "PROCESSING" || video.status === "PENDING" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-tt-accent" />
            <p className="text-xs text-tt-muted">Generating…</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-tt-border">
              <div className="h-full bg-tt-accent animate-progress rounded-full" />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <XCircle size={24} className="text-red-400" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        {/* Status + time */}
        <div className="flex items-center justify-between gap-2">
          <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>
            <StatusIcon size={10} className={video.status === "PROCESSING" ? "animate-spin" : ""} />
            {cfg.label}
          </span>
          <span className="text-[10px] text-tt-muted">{timeAgo(video.created_at)}</span>
        </div>

        {/* Prompt */}
        <p className="text-xs text-tt-text line-clamp-2 leading-relaxed">
          {video.user_prompt || video.enhanced_prompt || "No prompt"}
        </p>

        {/* Model badge */}
        {video.model_provider === "runway" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/15 px-2.5 py-0.5 text-[10px] font-bold text-green-400">
            ⚡ Runway Gen-4 Turbo
          </span>
        ) : video.model_provider === "veo" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-400">
            ☁ Google Veo
          </span>
        ) : video.model_provider === "kling" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-tt-border bg-tt-surface px-2.5 py-0.5 text-[10px] font-semibold text-tt-muted">
            Kling AI
          </span>
        ) : null}

        {/* Actions */}
        {video.status === "COMPLETED" && (video.video_url || video.image_url) && (
          <div className="flex items-center gap-2 pt-1">
            {!isImg && video.video_url && (
              <button
                onClick={onPlay}
                className="flex items-center gap-1 rounded-lg bg-tt-accent/10 px-3 py-1.5 text-[11px] font-semibold text-tt-accent hover:bg-tt-accent/20 transition-all"
              >
                <Play size={11} /> Play
              </button>
            )}
            <a
              href={video.video_url ?? video.image_url ?? "#"}
              download
              className="flex items-center gap-1 rounded-lg border border-tt-border px-3 py-1.5 text-[11px] font-semibold text-tt-muted hover:text-tt-text transition-all"
            >
              <Download size={11} /> Download
            </a>
          </div>
        )}

        {/* Error */}
        {video.status === "FAILED" && video.error_message && (
          <p className="text-[10px] text-red-300 bg-red-900/20 rounded-lg px-2 py-1.5 line-clamp-2">
            {video.error_message}
          </p>
        )}
      </div>
    </motion.div>
  );
}
