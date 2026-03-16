"use client";

export function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-surface-card border border-surface-border">
      {/* Video placeholder */}
      <div className="aspect-video skeleton" />
      <div className="p-4 space-y-3">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-20 rounded-full skeleton" />
        </div>
        {/* Prompt lines */}
        <div className="h-4 w-full rounded skeleton" />
        <div className="h-4 w-3/4 rounded skeleton" />
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-surface-border overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full animate-progress" />
        </div>
        <p className="text-xs text-surface-muted text-center animate-pulse">
          Generating video… this takes 2–5 minutes
        </p>
      </div>
    </div>
  );
}
