"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Video } from "../lib/api";
import {
  CheckCircle2, XCircle, Clock, Play, Download, Loader2, Mic,
} from "lucide-react";
import { clsx } from "clsx";

const STATUS_CONFIG = {
  PENDING: {
    icon:    Clock,
    label:   "Pending",
    classes: "text-tt-muted bg-tt-border/50 border-tt-border",
  },
  PROCESSING: {
    icon:    Loader2,
    label:   "Processing",
    classes: "text-blue-300 bg-blue-500/10 border-blue-500/20",
    spin:    true,
  },
  COMPLETED: {
    icon:    CheckCircle2,
    label:   "Completed",
    classes: "text-tt-accent bg-tt-accent/10 border-tt-accent/20",
  },
  FAILED: {
    icon:    XCircle,
    label:   "Failed",
    classes: "text-red-300 bg-red-500/10 border-red-500/20",
  },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function VideoCard({ video }: { video: Video }) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const config = STATUS_CONFIG[video.status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="group overflow-hidden rounded-2xl border border-tt-border bg-tt-card transition-all duration-300 hover:border-tt-accent/40 hover:shadow-card-hover"
    >
      {/* Media area */}
      <div className="relative aspect-video overflow-hidden bg-tt-surface">
        {video.status === "COMPLETED" && video.video_url ? (
          playing ? (
            <video
              src={video.video_url}
              autoPlay
              controls
              className="h-full w-full object-cover"
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <div className="relative h-full w-full cursor-pointer" onClick={() => setPlaying(true)}>
              {video.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url}
                  alt="Thumbnail"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-tt-surface to-tt-card" />
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 image-card-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm border border-white/20">
                  <Play size={18} className="ml-0.5 text-white" />
                </div>
              </div>
            </div>
          )
        ) : video.status === "PROCESSING" || video.status === "PENDING" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-tt-accent border-t-transparent animate-spin" />
            <p className="text-xs text-tt-muted">Generating…</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-tt-border">
              <div className="h-full bg-tt-accent animate-progress rounded-full" />
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <XCircle size={28} className="text-red-400" />
          </div>
        )}
      </div>

      {/* BIG Runway badge — TikTok-style */}
      <div className="px-4 pt-3 pb-1">
        <div className="rounded-xl border border-green-400/40 bg-gradient-to-r from-green-500/15 to-emerald-500/10 px-4 py-3 shadow-[0_0_24px_rgba(74,222,128,0.25)]">
          <p className="text-sm font-black text-green-400 tracking-wide">⚡ Generated with Runway Gen-4 Turbo</p>
          <p className="text-[11px] text-green-400/65 font-semibold mt-0.5">Real credits deducted</p>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 pb-4 pt-2 space-y-2.5">
        {/* Status + time row */}
        <div className="flex items-center justify-between gap-2">
          <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", config.classes)}>
            <StatusIcon size={11} className={"spin" in config && config.spin ? "animate-spin" : ""} />
            {config.label}
          </span>
          <span className="text-[11px] text-tt-muted">{timeAgo(video.created_at)}</span>
        </div>

        {/* Prompt */}
        <p className="text-xs text-tt-text line-clamp-2 leading-relaxed">
          {video.user_prompt || "No prompt"}
        </p>

        {/* Enhanced prompt */}
        {video.enhanced_prompt && video.enhanced_prompt !== video.user_prompt && (
          <details className="group/det">
            <summary className="cursor-pointer text-[11px] text-tt-muted hover:text-tt-text transition-colors">
              View cinematic prompt ›
            </summary>
            <p className="mt-1.5 text-[11px] text-tt-muted/80 leading-relaxed">
              {video.enhanced_prompt}
            </p>
          </details>
        )}

        {/* Error */}
        {video.status === "FAILED" && video.error_message && (
          <p className="rounded-lg bg-red-900/20 px-3 py-2 text-[11px] text-red-300">
            {video.error_message}
          </p>
        )}

        {/* Actions */}
        {video.status === "COMPLETED" && video.video_url && (
          <div className="flex items-center gap-2 pt-1">
            <a
              href={video.video_url}
              download
              className="flex items-center gap-1.5 rounded-lg border border-tt-border px-3 py-1.5 text-[11px] font-semibold text-tt-muted hover:text-tt-text transition-all"
            >
              <Download size={12} /> Download
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
}
