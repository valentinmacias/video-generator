"use client";

import { useState, useCallback } from "react";
import {
  Sparkles, Send, Film, Image, Info, ChevronDown, ChevronUp,
  Wand2, Eye, EyeOff, Zap, Clock, Maximize2, Camera, Wind,
  Sun, Palette, Star, Hash, Ban, Layers,
} from "lucide-react";
import {
  Brand, GenerateResponse, GenerateRequest,
  VideoParams, ImageParams,
  DEFAULT_VIDEO_PARAMS, DEFAULT_IMAGE_PARAMS,
  GenerationMode, generateAsset,
} from "../lib/api";

// ── Props ───────────────────────────────────────────────────────────────────────

interface GenerationFormProps {
  brands: Brand[];
  onGenerated: (response: GenerateResponse) => void;
}

// ── Option lists ────────────────────────────────────────────────────────────────

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9",  label: "16:9 — Landscape" },
  { value: "9:16",  label: "9:16 — Portrait / Reels" },
  { value: "1:1",   label: "1:1 — Square" },
  { value: "21:9",  label: "21:9 — Ultrawide (video only)" },
  { value: "4:3",   label: "4:3 — Classic" },
];

const VIDEO_DURATION_OPTIONS = [
  { value: 5,  label: "5 seconds — Short" },
  { value: 8,  label: "8 seconds — Standard" },
  { value: 10, label: "10 seconds — Extended" },
];

const CAMERA_MOVEMENT_OPTIONS = [
  { value: "static",        label: "Static — Locked camera" },
  { value: "slow_pan",      label: "Slow Pan — Gentle horizontal sweep" },
  { value: "dolly_in",      label: "Dolly In — Slow push toward subject" },
  { value: "dolly_out",     label: "Dolly Out — Pull away dramatically" },
  { value: "crane",         label: "Crane Shot — Sweeping vertical arc" },
  { value: "orbit",         label: "Orbit — Circle around subject" },
  { value: "handheld",      label: "Handheld — Intimate, natural feel" },
  { value: "epic_tracking", label: "Epic Tracking — Dynamic follow shot" },
];

const MOTION_STRENGTH_OPTIONS = [
  { value: "subtle",  label: "Subtle — Gentle, quiet motion" },
  { value: "medium",  label: "Medium — Natural, balanced" },
  { value: "dynamic", label: "Dynamic — Energetic movement" },
  { value: "epic",    label: "Epic — Powerful, sweeping energy" },
];

const LIGHTING_OPTIONS = [
  { value: "soft_natural", label: "Soft Natural — Diffused daylight" },
  { value: "golden_hour",  label: "Golden Hour — Warm amber tones" },
  { value: "dramatic",     label: "Dramatic — High-contrast shadows" },
  { value: "studio",       label: "Studio — Clean, controlled light" },
  { value: "neon",         label: "Neon — Vibrant, urban glow" },
];

const VISUAL_STYLE_OPTIONS = [
  { value: "cinematic",      label: "Cinematic — Film-grade look" },
  { value: "photorealistic", label: "Photorealistic — True-to-life" },
  { value: "commercial",     label: "Commercial — Polished brand-safe" },
  { value: "artistic",       label: "Artistic — Painterly, expressive" },
  { value: "anime",          label: "Anime — Vibrant animation style" },
];

const IMAGE_STYLE_OPTIONS = [
  { value: "photorealistic", label: "Photorealistic — True-to-life photo" },
  { value: "cinematic",      label: "Cinematic — Movie still quality" },
  { value: "commercial",     label: "Commercial — Brand-safe & polished" },
  { value: "artistic",       label: "Artistic — Fine art aesthetic" },
  { value: "illustration",   label: "Illustration — Digital art" },
  { value: "3d_render",      label: "3D Render — CGI quality" },
  { value: "anime",          label: "Anime — Vibrant anime style" },
];

const QUALITY_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "high",     label: "High" },
  { value: "ultra",    label: "Ultra" },
];

const IMAGE_COUNT_OPTIONS = [
  { value: 1, label: "1 image" },
  { value: 2, label: "2 images" },
  { value: 3, label: "3 images" },
  { value: 4, label: "4 images" },
];

// ── Tooltip ──────────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span
        className="
          pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56
          -translate-x-1/2 rounded-lg border border-surface-border
          bg-slate-900 px-3 py-2 text-center text-xs text-slate-300
          opacity-0 shadow-xl transition-opacity group-hover:opacity-100
        "
      >
        {text}
      </span>
    </span>
  );
}

// ── Field label with optional tooltip ───────────────────────────────────────────

function FieldLabel({
  label,
  tooltip,
  icon: Icon,
}: {
  label: string;
  tooltip?: string;
  icon?: React.ElementType;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300">
      {Icon && <Icon className="w-3.5 h-3.5 text-surface-muted" />}
      {label}
      {tooltip && (
        <Tooltip text={tooltip}>
          <Info className="w-3 h-3 cursor-help text-surface-muted" />
        </Tooltip>
      )}
    </label>
  );
}

// ── Styled select ────────────────────────────────────────────────────────────────

function SelectField({
  label,
  tooltip,
  icon,
  value,
  onChange,
  options,
}: {
  label: string;
  tooltip?: string;
  icon?: React.ElementType;
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} tooltip={tooltip} icon={icon} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="
          w-full rounded-lg border border-surface-border bg-surface
          px-3 py-2 text-sm text-slate-200
          focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
        "
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 text-left"
    >
      <span
        className={`
          relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full
          border-2 border-transparent transition-colors duration-200
          ${checked ? "bg-brand-600" : "bg-slate-700"}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 transform rounded-full
            bg-white shadow transition-transform duration-200
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </span>
      <span>
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {description && (
          <span className="block text-xs text-surface-muted">{description}</span>
        )}
      </span>
    </button>
  );
}

// ── Live parameter preview card ──────────────────────────────────────────────────

function PreviewCard({
  mode,
  videoParams,
  imageParams,
  enhancePrompt,
  prompt,
}: {
  mode: GenerationMode;
  videoParams: VideoParams;
  imageParams: ImageParams;
  enhancePrompt: boolean;
  prompt: string;
}) {
  const isVideo = mode === "video";

  const previewRows = isVideo
    ? [
        { label: "Duration",   value: `${videoParams.duration}s` },
        { label: "Aspect",     value: videoParams.aspect_ratio },
        { label: "Camera",     value: cameraLabel(videoParams.camera_movement) },
        { label: "Motion",     value: capitalize(videoParams.motion_strength) },
        { label: "Lighting",   value: lightingLabel(videoParams.lighting_style) },
        { label: "Style",      value: capitalize(videoParams.visual_style) },
        { label: "Quality",    value: capitalize(videoParams.quality) },
      ]
    : [
        { label: "Aspect",     value: imageParams.aspect_ratio },
        { label: "Style",      value: imageStyleLabel(imageParams.style) },
        { label: "Quality",    value: capitalize(imageParams.quality) },
        { label: "Images",     value: `${imageParams.number_of_images}` },
      ];

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-4 sticky top-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className={`
            flex h-7 w-7 items-center justify-center rounded-lg
            ${isVideo ? "bg-brand-600" : "bg-purple-600"}
          `}
        >
          {isVideo ? (
            <Film className="h-4 w-4 text-white" />
          ) : (
            <Image className="h-4 w-4 text-white" />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
            Preview
          </p>
          <p className="text-sm font-medium text-slate-200">
            {isVideo ? "Video Generation" : "Image Generation"}
          </p>
        </div>
      </div>

      {/* Prompt preview */}
      {prompt && (
        <div className="rounded-lg border border-surface-border bg-surface-card p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-surface-muted">Prompt</p>
          <p className="line-clamp-3 text-xs text-slate-300">{prompt}</p>
        </div>
      )}

      {/* Parameter rows */}
      <div className="space-y-2">
        {previewRows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs text-surface-muted">{label}</span>
            <span className="rounded-md bg-surface-card px-2 py-0.5 text-xs font-medium text-slate-300">
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-surface-border" />

      {/* Enhancement status */}
      <div className="flex items-center gap-2">
        {enhancePrompt ? (
          <>
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs text-amber-300">Gemini enhancement ON</span>
          </>
        ) : (
          <>
            <EyeOff className="h-3.5 w-3.5 text-surface-muted" />
            <span className="text-xs text-surface-muted">Raw mode — no enhancement</span>
          </>
        )}
      </div>

      {/* Estimated time */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-surface-muted" />
        <span className="text-xs text-surface-muted">
          {isVideo ? "Est. 2–5 min (async)" : "Est. 5–20 seconds"}
        </span>
      </div>
    </div>
  );
}

// ── Label helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cameraLabel(v: string) {
  const map: Record<string, string> = {
    static: "Static",
    slow_pan: "Slow Pan",
    dolly_in: "Dolly In",
    dolly_out: "Dolly Out",
    crane: "Crane",
    orbit: "Orbit",
    handheld: "Handheld",
    epic_tracking: "Epic Track",
  };
  return map[v] ?? v;
}

function lightingLabel(v: string) {
  const map: Record<string, string> = {
    soft_natural: "Soft Natural",
    golden_hour: "Golden Hour",
    dramatic: "Dramatic",
    studio: "Studio",
    neon: "Neon",
  };
  return map[v] ?? v;
}

function imageStyleLabel(v: string) {
  const map: Record<string, string> = {
    photorealistic: "Photo",
    cinematic: "Cinematic",
    commercial: "Commercial",
    artistic: "Artistic",
    illustration: "Illustration",
    "3d_render": "3D Render",
    anime: "Anime",
  };
  return map[v] ?? v;
}

// ── Main form component ──────────────────────────────────────────────────────────

export function GenerationForm({ brands, onGenerated }: GenerationFormProps) {
  // ── Mode ──────────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<GenerationMode>("video");

  // ── Brand ─────────────────────────────────────────────────────────────────────
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const effectiveBrandId = selectedBrandId || brands[0]?.id || "";
  const selectedBrand = brands.find((b) => b.id === effectiveBrandId);

  // ── Prompt ────────────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [enhancePrompt, setEnhancePrompt] = useState(true);

  // ── Video params ──────────────────────────────────────────────────────────────
  const [videoParams, setVideoParams] = useState<VideoParams>(DEFAULT_VIDEO_PARAMS);

  const setVP = useCallback(
    <K extends keyof VideoParams>(key: K, value: VideoParams[K]) =>
      setVideoParams((p) => ({ ...p, [key]: value })),
    [],
  );

  // ── Image params ──────────────────────────────────────────────────────────────
  const [imageParams, setImageParams] = useState<ImageParams>(DEFAULT_IMAGE_PARAMS);

  const setIP = useCallback(
    <K extends keyof ImageParams>(key: K, value: ImageParams[K]) =>
      setImageParams((p) => ({ ...p, [key]: value })),
    [],
  );

  // ── Advanced ──────────────────────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Submit ────────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !effectiveBrandId) return;

    setLoading(true);
    setError(null);

    const req: GenerateRequest = {
      brand_id: effectiveBrandId,
      mode,
      user_prompt: prompt.trim(),
      enhance_prompt: enhancePrompt,
      ...(mode === "video" ? { video_params: videoParams } : { image_params: imageParams }),
    };

    try {
      const response = await generateAsset(req);
      onGenerated(response);
      setPrompt("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  const isVideo = mode === "video";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-surface-border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-purple-600">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Create with AI
            </h2>
            <p className="text-xs text-surface-muted">
              Powered by Google Veo + Imagen + Gemini
            </p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout: form | preview ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[1fr_220px]">

        {/* ── Left: form ────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Mode switcher */}
          <div className="flex rounded-lg border border-surface-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setMode("video")}
              className={`
                flex flex-1 items-center justify-center gap-2 rounded-md
                py-2 text-sm font-medium transition-colors
                ${isVideo
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-surface-muted hover:text-slate-300"}
              `}
            >
              <Film className="h-4 w-4" />
              Generate Video
            </button>
            <button
              type="button"
              onClick={() => setMode("image")}
              className={`
                flex flex-1 items-center justify-center gap-2 rounded-md
                py-2 text-sm font-medium transition-colors
                ${!isVideo
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-surface-muted hover:text-slate-300"}
              `}
            >
              <Image className="h-4 w-4" />
              Generate Image
            </button>
          </div>

          {/* Brand selector */}
          <div className="space-y-1.5">
            <FieldLabel label="Brand" tooltip="Your brand defines visual identity, style guide, and reference images used in generation." />
            {brands.length === 0 ? (
              <p className="text-sm text-amber-400">
                ⚠ Create a brand first using the Brand Dashboard.
              </p>
            ) : (
              <select
                value={effectiveBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="
                  w-full rounded-lg border border-surface-border bg-surface
                  px-3 py-2.5 text-sm text-slate-200
                  focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
                "
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.reference_images.length > 0
                      ? ` (${b.reference_images.length} ref${b.reference_images.length > 1 ? "s" : ""})`
                      : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Brand reference chips */}
            {selectedBrand && (selectedBrand.reference_images.length > 0 || selectedBrand.style_guide) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {selectedBrand.reference_images.map((_, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-brand-700/40 bg-brand-900/40 px-2.5 py-0.5 text-xs text-brand-300"
                  >
                    🖼 Ref {i + 1}
                  </span>
                ))}
                {selectedBrand.style_guide && (
                  <span className="rounded-full border border-purple-700/40 bg-purple-900/40 px-2.5 py-0.5 text-xs text-purple-300">
                    📋 Style guide
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <FieldLabel
              label={isVideo ? "Describe your video" : "Describe your image"}
              tooltip="Write a clear scene description. Gemini will expand it into a rich cinematic prompt automatically."
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                isVideo
                  ? "A chef in a modern kitchen preparing a vibrant salad, natural light streaming through the window…"
                  : "A sleek product bottle on a marble surface, soft studio lighting, minimalist background…"
              }
              rows={3}
              required
              minLength={10}
              maxLength={1000}
              className="
                w-full resize-none rounded-lg border border-surface-border bg-surface
                px-3 py-2.5 text-sm text-slate-200 placeholder-surface-muted
                focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
              "
            />
            <p className="text-right text-xs text-surface-muted">{prompt.length}/1000</p>
          </div>

          {/* ── Video params ─────────────────────────────────────────────────── */}
          {isVideo && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
                Video Settings
              </p>

              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Duration"
                  icon={Clock}
                  tooltip="How long the generated video will be. Longer durations take more time."
                  value={videoParams.duration}
                  onChange={(v) => setVP("duration", Number(v) as 5 | 8 | 10)}
                  options={VIDEO_DURATION_OPTIONS}
                />
                <SelectField
                  label="Aspect Ratio"
                  icon={Maximize2}
                  tooltip="Frame dimensions. Use 16:9 for widescreen, 9:16 for vertical/Reels."
                  value={videoParams.aspect_ratio}
                  onChange={(v) => setVP("aspect_ratio", v as VideoParams["aspect_ratio"])}
                  options={ASPECT_RATIO_OPTIONS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Camera Movement"
                  icon={Camera}
                  tooltip="How the virtual camera moves during the shot. Adds cinematic dynamism."
                  value={videoParams.camera_movement}
                  onChange={(v) => setVP("camera_movement", v as VideoParams["camera_movement"])}
                  options={CAMERA_MOVEMENT_OPTIONS}
                />
                <SelectField
                  label="Motion Strength"
                  icon={Wind}
                  tooltip="Overall intensity of movement and energy within the scene."
                  value={videoParams.motion_strength}
                  onChange={(v) => setVP("motion_strength", v as VideoParams["motion_strength"])}
                  options={MOTION_STRENGTH_OPTIONS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Lighting Style"
                  icon={Sun}
                  tooltip="The primary lighting setup. Sets the mood and atmosphere of the scene."
                  value={videoParams.lighting_style}
                  onChange={(v) => setVP("lighting_style", v as VideoParams["lighting_style"])}
                  options={LIGHTING_OPTIONS}
                />
                <SelectField
                  label="Visual Style"
                  icon={Palette}
                  tooltip="The overall aesthetic treatment applied to the video."
                  value={videoParams.visual_style}
                  onChange={(v) => setVP("visual_style", v as VideoParams["visual_style"])}
                  options={VISUAL_STYLE_OPTIONS}
                />
              </div>

              <SelectField
                label="Quality"
                icon={Star}
                tooltip="Output quality level. Ultra produces sharper, more detailed results but may take longer."
                value={videoParams.quality}
                onChange={(v) => setVP("quality", v as VideoParams["quality"])}
                options={QUALITY_OPTIONS}
              />
            </div>
          )}

          {/* ── Image params ─────────────────────────────────────────────────── */}
          {!isVideo && (
            <div className="space-y-4 animate-fade-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
                Image Settings
              </p>

              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Aspect Ratio"
                  icon={Maximize2}
                  tooltip="Frame proportions. 16:9 for landscape, 9:16 for portrait/Reels, 1:1 for square."
                  value={imageParams.aspect_ratio}
                  onChange={(v) => setIP("aspect_ratio", v as ImageParams["aspect_ratio"])}
                  options={ASPECT_RATIO_OPTIONS.filter((o) => o.value !== "21:9")}
                />
                <SelectField
                  label="Number of Images"
                  icon={Layers}
                  tooltip="How many image variations to generate in one request."
                  value={imageParams.number_of_images}
                  onChange={(v) => setIP("number_of_images", Number(v) as 1 | 2 | 3 | 4)}
                  options={IMAGE_COUNT_OPTIONS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label="Style"
                  icon={Palette}
                  tooltip="The visual aesthetic of the generated image."
                  value={imageParams.style}
                  onChange={(v) => setIP("style", v as ImageParams["style"])}
                  options={IMAGE_STYLE_OPTIONS}
                />
                <SelectField
                  label="Quality"
                  icon={Star}
                  tooltip="Output fidelity. Ultra adds extra detail and sharpness."
                  value={imageParams.quality}
                  onChange={(v) => setIP("quality", v as ImageParams["quality"])}
                  options={QUALITY_OPTIONS}
                />
              </div>
            </div>
          )}

          {/* ── Advanced options ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-surface-muted transition-colors hover:text-slate-300"
            >
              {showAdvanced ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="space-y-3 rounded-lg border border-surface-border p-3 animate-slide-up">
                {/* Seed */}
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Seed"
                    icon={Hash}
                    tooltip="Optional fixed seed for reproducible results. Leave blank for random."
                  />
                  <input
                    type="number"
                    placeholder="Random"
                    value={isVideo ? (videoParams.seed ?? "") : (imageParams.seed ?? "")}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      isVideo ? setVP("seed", v) : setIP("seed", v);
                    }}
                    className="
                      w-full rounded-lg border border-surface-border bg-surface
                      px-3 py-2 text-sm text-slate-200 placeholder-surface-muted
                      focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
                    "
                  />
                </div>

                {/* Negative prompt */}
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Negative Prompt"
                    icon={Ban}
                    tooltip="Describe what you want to exclude from the result, e.g. 'blurry, text overlays, watermarks'."
                  />
                  <textarea
                    value={
                      isVideo
                        ? (videoParams.negative_prompt ?? "")
                        : (imageParams.negative_prompt ?? "")
                    }
                    onChange={(e) => {
                      const v = e.target.value || null;
                      isVideo
                        ? setVP("negative_prompt", v)
                        : setIP("negative_prompt", v);
                    }}
                    placeholder="blurry, watermarks, text overlays, distorted faces…"
                    rows={2}
                    maxLength={500}
                    className="
                      w-full resize-none rounded-lg border border-surface-border bg-surface
                      px-3 py-2 text-sm text-slate-200 placeholder-surface-muted
                      focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
                    "
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Gemini toggle ────────────────────────────────────────────────── */}
          <div className="rounded-lg border border-surface-border p-3 space-y-3">
            <Toggle
              checked={enhancePrompt}
              onChange={setEnhancePrompt}
              label="Enhance with Gemini"
              description="Expands your prompt into a rich cinematic description"
            />
            {enhancePrompt && (
              <Toggle
                checked={false}
                onChange={(raw) => setEnhancePrompt(!raw)}
                label="Raw Mode"
                description="Send your prompt exactly as written, no AI expansion"
              />
            )}
            {!enhancePrompt && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Zap className="h-3.5 w-3.5" />
                Raw mode: your prompt is sent directly to {isVideo ? "Veo" : "Imagen"}.
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-800/40 bg-red-900/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !prompt.trim() || !effectiveBrandId}
            className={`
              flex w-full items-center justify-center gap-2 rounded-lg
              px-4 py-3 text-sm font-semibold text-white transition-colors
              disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500
              ${isVideo
                ? "bg-brand-600 hover:bg-brand-700"
                : "bg-purple-600 hover:bg-purple-700"}
            `}
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {isVideo ? "Submitting to Veo…" : "Generating with Imagen…"}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {isVideo ? "Generate Video" : "Generate Image"}
              </>
            )}
          </button>
        </form>

        {/* ── Right: live preview ──────────────────────────────────────────── */}
        <PreviewCard
          mode={mode}
          videoParams={videoParams}
          imageParams={imageParams}
          enhancePrompt={enhancePrompt}
          prompt={prompt}
        />
      </div>
    </div>
  );
}
