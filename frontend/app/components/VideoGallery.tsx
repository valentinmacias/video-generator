"use client";

import { useEffect, useState, useCallback } from "react";
import { Video, listVideos } from "../lib/api";
import { VideoCard } from "./VideoCard";
import { SkeletonCard } from "./SkeletonCard";
import { RefreshCw } from "lucide-react";

interface VideoGalleryProps {
  brandId?: string;
  /** IDs of videos that are currently being generated (show skeleton) */
  pendingIds?: string[];
}

const POLL_MS = 6000;

export function VideoGallery({ brandId, pendingIds = [] }: VideoGalleryProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVideos = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await listVideos(brandId);
      setVideos(data);
    } catch (e) {
      console.error("Gallery fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [brandId]);

  // Initial load
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Auto-refresh while any video is PROCESSING or PENDING
  useEffect(() => {
    const hasActive = videos.some(
      (v) => v.status === "PROCESSING" || v.status === "PENDING",
    ) || pendingIds.length > 0;

    if (!hasActive) return;

    const timer = setInterval(() => fetchVideos(true), POLL_MS);
    return () => clearInterval(timer);
  }, [videos, pendingIds, fetchVideos]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // Skeleton slots for in-flight generations not yet in DB
  const newPendingIds = pendingIds.filter(
    (id) => !videos.find((v) => v.id === id),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Video Gallery
          {videos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-surface-muted">
              ({videos.length} video{videos.length !== 1 ? "s" : ""})
            </span>
          )}
        </h2>
        <button
          onClick={() => fetchVideos()}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Grid */}
      {videos.length === 0 && newPendingIds.length === 0 ? (
        <div className="col-span-full py-16 text-center text-surface-muted">
          <p className="text-lg">No videos yet.</p>
          <p className="text-sm mt-1">Generate your first video using the form above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Skeleton placeholders for pending generations */}
          {newPendingIds.map((id) => (
            <SkeletonCard key={`skeleton-${id}`} />
          ))}
          {/* Actual video cards */}
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
