"use client";

import { Video } from "../lib/api";
import {
  CheckCircle2, XCircle, Clock, Play, Download, Loader2,
} from "lucide-react";
import { useState } from "react";

const STATUS_CONFIG = {
  PENDING: {
    icon: Clock,
    label: "Pending",
    classes: "bg-slate-800 text-slate-300",
  },
  PROCESSING: {
    icon: Loader2,
    label: "Processing",
    classes: "bg-blue-900/60 text-blue-300",
    spin: true,
  },
  COMPLETED: {
    icon: CheckCircle2,
    label: "Completed",
    classes: "bg-emerald-900/60 text-emerald-300",
  },
  FAILED: {
    icon: XCircle,
    label: "Failed",
    classes: "bg-red-900/60 text-red-300",
  },
};

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  const [playing, setPlaying] = useState(false);
  const config = STATUS_CONFIG[video.status];
  const StatusIcon = config.icon;

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="rounded-xl overflow-hidden bg-surface-card border border-surface-border hover:border-brand-500/50 transition-all duration-200 group animate-fade-in">
      {/* Video / Preview area */}
      <div className="relative aspect-video bg-slate-900">
        {video.status === "COMPLETED" && video.video_url ? (
          playing ? (
            <video
              src={video.video_url}
              autoPlay
              controls
              className="w-full h-full object-cover"
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center group/play"
              aria-label="Play video"
            >
              {video.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail_url}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
              )}
              <div className="absolute inset-0 bg-black/30 group-hover/play:bg-black/20 transition-colors" />
              <div className="absolute w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover/play:scale-110 transition-transform">
                <Play className="w-6 h-6 text-slate-900 ml-1" />
              </div>
            </button>
          )
        ) : video.status === "PROCESSING" || video.status === "PENDING" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            <p className="text-sm text-surface-muted">Generating…</p>
            {/* Animated progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
              <div className="h-full bg-brand-500 animate-progress rounded-full" />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-400" />
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Status + time */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.classes}`}
          >
            <StatusIcon
              className={`w-3.5 h-3.5 ${"spin" in config && config.spin ? "animate-spin" : ""}`}
            />
            {config.label}
          </span>
          <span className="text-xs text-surface-muted">{timeAgo(video.created_at)}</span>
        </div>

        {/* Prompt */}
        <p className="text-sm text-slate-300 line-clamp-2">{video.user_prompt}</p>

        {/* Enhanced prompt (collapsed) */}
        {video.enhanced_prompt && video.enhanced_prompt !== video.user_prompt && (
          <details className="group/det">
            <summary className="text-xs text-surface-muted cursor-pointer hover:text-slate-300 transition-colors">
              View cinematic prompt ›
            </summary>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {video.enhanced_prompt}
            </p>
          </details>
        )}

        {/* Error */}
        {video.status === "FAILED" && video.error_message && (
          <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">
            {video.error_message}
          </p>
        )}

        {/* Download */}
        {video.status === "COMPLETED" && video.video_url && (
          <a
            href={video.video_url}
            download
            className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-400 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download video
          </a>
        )}
      </div>
    </div>
  );
}
