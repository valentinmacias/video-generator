"use client";

import { useState, useEffect } from "react";
import { Brand, generateVideo, GenerateResponse } from "../lib/api";
import { Sparkles, Send, ChevronDown } from "lucide-react";

interface VideoGeneratorProps {
  brands: Brand[];
  onGenerated: (response: GenerateResponse) => void;
}

export function VideoGenerator({ brands, onGenerated }: VideoGeneratorProps) {
  const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");

  // Sync selectedBrandId when brands load asynchronously after mount
  useEffect(() => {
    if (!selectedBrandId && brands.length > 0) {
      setSelectedBrandId(brands[0].id);
    }
  }, [brands, selectedBrandId]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !selectedBrandId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await generateVideo(
        selectedBrandId,
        prompt.trim(),
        additionalInstructions.trim() || undefined,
      );
      onGenerated(response);
      setPrompt("");
      setAdditionalInstructions("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface-card border border-surface-border p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-100">Generate Video</h2>
          <p className="text-xs text-surface-muted">
            Powered by Gemini + Google Veo 3.1
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Brand selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300">Brand</label>
          {brands.length === 0 ? (
            <p className="text-sm text-amber-400">
              ⚠ Create a brand first using the Brand Dashboard.
            </p>
          ) : (
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="w-full bg-surface border border-surface-border text-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{" "}
                  {b.reference_images.length > 0
                    ? `(${b.reference_images.length} ref${b.reference_images.length > 1 ? "s" : ""})`
                    : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Brand reference chips */}
        {selectedBrand && selectedBrand.reference_images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedBrand.reference_images.map((uri, i) => (
              <span
                key={i}
                className="text-xs bg-brand-900/40 text-brand-300 border border-brand-700/40 rounded-full px-2.5 py-0.5"
              >
                🖼 Ref {i + 1}
              </span>
            ))}
            {selectedBrand.style_guide && (
              <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40 rounded-full px-2.5 py-0.5">
                📋 Style guide
              </span>
            )}
          </div>
        )}

        {/* Prompt input */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-300">
            Describe your video
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A chef in a modern kitchen preparing a vibrant salad, natural light streaming through the window…"
            rows={3}
            required
            minLength={10}
            maxLength={1000}
            className="w-full bg-surface border border-surface-border text-slate-200 rounded-lg px-3 py-2.5 text-sm placeholder-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          />
          <p className="text-xs text-surface-muted text-right">
            {prompt.length}/1000
          </p>
        </div>

        {/* Advanced options */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-sm text-surface-muted hover:text-slate-300 transition-colors"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          Advanced options
        </button>

        {showAdvanced && (
          <div className="space-y-1.5 animate-slide-up">
            <label className="text-sm font-medium text-slate-300">
              Additional style instructions
            </label>
            <textarea
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Use warm colour tones. Avoid text overlays. Slow motion for product close-ups."
              rows={2}
              maxLength={500}
              className="w-full bg-surface border border-surface-border text-slate-200 rounded-lg px-3 py-2.5 text-sm placeholder-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 bg-red-900/20 rounded-lg p-3 border border-red-800/40">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !prompt.trim() || !selectedBrandId || brands.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting to Veo…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Generate Video
            </>
          )}
        </button>

        {!loading && (
          <p className="text-xs text-surface-muted text-center">
            ✨ Your prompt will be automatically enhanced by Gemini before generation
          </p>
        )}
      </form>
    </div>
  );
}
