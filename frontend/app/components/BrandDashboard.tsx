"use client";

import { useState, useRef } from "react";
import { Brand, createBrand, uploadBrandImages } from "../lib/api";
import {
  Palette, Plus, Upload, X, CheckCircle2, ChevronDown, Image as ImageIcon,
} from "lucide-react";

interface BrandDashboardProps {
  brands: Brand[];
  onBrandCreated: (brand: Brand) => void;
  onBrandUpdated: (brand: Brand) => void;
}

export function BrandDashboard({
  brands,
  onBrandCreated,
  onBrandUpdated,
}: BrandDashboardProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);

  // ── Create brand form ──────────────────────────────────────────────────────
  const [newBrandName, setNewBrandName] = useState("");
  const [newStyleGuide, setNewStyleGuide] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const brand = await createBrand(newBrandName.trim(), newStyleGuide.trim() || undefined);
      onBrandCreated(brand);
      setNewBrandName("");
      setNewStyleGuide("");
      setShowCreateForm(false);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create brand");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface-card border border-surface-border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Brand Assets</h2>
            <p className="text-xs text-surface-muted">
              Reference images & style guides
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Brand
        </button>
      </div>

      {/* Create brand form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateBrand}
          className="animate-slide-up border border-surface-border rounded-lg p-4 space-y-3 bg-surface"
        >
          <h3 className="text-sm font-medium text-slate-200">Create New Brand</h3>
          <input
            type="text"
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            placeholder="Brand name (e.g. Acme Corp)"
            required
            className="w-full bg-surface-card border border-surface-border text-slate-200 rounded-lg px-3 py-2 text-sm placeholder-surface-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <textarea
            value={newStyleGuide}
            onChange={(e) => setNewStyleGuide(e.target.value)}
            placeholder="Style guide: modern minimalist, warm earth tones, cinematic 16:9, product close-ups…"
            rows={3}
            className="w-full bg-surface-card border border-surface-border text-slate-200 rounded-lg px-3 py-2 text-sm placeholder-surface-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
          {createError && (
            <p className="text-xs text-red-400">{createError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white text-sm rounded-lg py-2 transition-colors"
            >
              {creating ? "Creating…" : "Create Brand"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-2 text-sm text-surface-muted hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Brand list */}
      {brands.length === 0 ? (
        <p className="text-sm text-surface-muted text-center py-6">
          No brands yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {brands.map((brand) => (
            <BrandItem
              key={brand.id}
              brand={brand}
              expanded={expandedBrandId === brand.id}
              onToggle={() =>
                setExpandedBrandId(expandedBrandId === brand.id ? null : brand.id)
              }
              onUpdated={onBrandUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual brand item ──────────────────────────────────────────────────────

function BrandItem({
  brand,
  expanded,
  onToggle,
  onUpdated,
}: {
  brand: Brand;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: (b: Brand) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3);
    setSelectedFiles(files);
    setUploadError(null);
    setUploadSuccess(false);
  }

  async function handleUpload() {
    if (!selectedFiles.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadBrandImages(brand.id, selectedFiles);
      onUpdated({ ...brand, reference_images: result.reference_images });
      setSelectedFiles([]);
      setUploadSuccess(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-surface-border overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 to-brand-500 flex items-center justify-center text-white text-xs font-bold">
            {brand.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">{brand.name}</p>
            <p className="text-xs text-surface-muted">
              {brand.reference_images.length} image
              {brand.reference_images.length !== 1 ? "s" : ""} ·{" "}
              {brand.style_guide ? "has style guide" : "no style guide"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-surface-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-surface-border bg-surface animate-slide-up">
          {/* Style guide */}
          {brand.style_guide && (
            <div className="pt-3">
              <p className="text-xs font-medium text-slate-400 mb-1">Style Guide</p>
              <p className="text-xs text-slate-300 bg-surface-card rounded p-2 leading-relaxed">
                {brand.style_guide}
              </p>
            </div>
          )}

          {/* Reference images */}
          {brand.reference_images.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Reference Images</p>
              <div className="flex gap-2 flex-wrap">
                {brand.reference_images.map((uri, i) => (
                  <div
                    key={i}
                    className="w-16 h-16 rounded-md bg-surface-card border border-surface-border flex items-center justify-center overflow-hidden"
                    title={uri}
                  >
                    <ImageIcon className="w-5 h-5 text-surface-muted" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload area */}
          {brand.reference_images.length < 3 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400">
                Add Reference Images ({brand.reference_images.length}/3)
              </p>
              <label className="flex flex-col items-center gap-2 border-2 border-dashed border-surface-border rounded-lg p-4 cursor-pointer hover:border-brand-500/50 transition-colors">
                <Upload className="w-5 h-5 text-surface-muted" />
                <span className="text-xs text-surface-muted">
                  Click to select JPEG / PNG / WebP
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleFilesChange}
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate max-w-[180px]">{f.name}</span>
                      <button
                        onClick={() =>
                          setSelectedFiles(selectedFiles.filter((_, j) => j !== i))
                        }
                        className="text-surface-muted hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full mt-2 text-xs bg-brand-600 hover:bg-brand-700 disabled:bg-slate-700 text-white rounded py-1.5 transition-colors flex items-center justify-center gap-1"
                  >
                    {uploading ? (
                      <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              )}

              {uploadSuccess && (
                <p className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded successfully
                </p>
              )}
              {uploadError && (
                <p className="text-xs text-red-400">{uploadError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
