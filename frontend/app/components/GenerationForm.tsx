"use client";

import { useState, useCallback, useRef } from "react";
import {
  Sparkles, Send, Film, ImageIcon, Info, ChevronDown, ChevronUp,
  Wand2, Eye, EyeOff, Zap, Clock, Maximize2, Camera, Wind,
  Sun, Palette, Star, Hash, Ban, Layers, Upload, X, Video,
  Cpu, RefreshCw, Play, SquarePlay, AlertTriangle, Sliders,
  Users, Clapperboard,
} from "lucide-react";
import {
  Brand, GenerateResponse, GenerateRequest,
  VideoParams, ImageParams, KlingParams, ModelProvider,
  DEFAULT_VIDEO_PARAMS, DEFAULT_IMAGE_PARAMS, DEFAULT_KLING_PARAMS,
  GenerationMode, VeoModel, MotionStrength,
  generateAsset, fileToBase64,
} from "../lib/api";

// ── Types ────────────────────────────────────────────────────────────────────────

interface GenerationFormProps {
  brands:      Brand[];
  onGenerated: (response: GenerateResponse) => void;
}

interface MediaFile {
  file:      File;
  b64:       string;
  objectUrl: string;
}

// ── Option lists ─────────────────────────────────────────────────────────────────

// ── Provider + model options ──────────────────────────────────────────────────────

const PROVIDER_OPTIONS: {
  value: ModelProvider; label: string; badge: string; badgeColor: string;
  desc: string; warning?: string;
}[] = [
  {
    value:      "veo",
    label:      "Google Veo 3.1",
    badge:      "Cinematic quality",
    badgeColor: "bg-blue-900/50 text-blue-300 border-blue-800/40",
    desc:       "Google's flagship model — highest fidelity, best for polished brand content",
    warning:    "Strict safety filters active",
  },
  {
    value:      "kling",
    label:      "Kling 3.0",
    badge:      "Best for UGC & B-rolls",
    badgeColor: "bg-emerald-900/50 text-emerald-300 border-emerald-800/40",
    desc:       "Excels at realistic UGC-style content and subject consistency from reference images",
  },
];

const KLING_MODEL_OPTIONS = [
  { value: "kling-3.0", label: "Kling 3.0", badge: "Latest",       desc: "Most powerful, best realism" },
  { value: "kling-2.1", label: "Kling 2.1", badge: "Master",       desc: "Previous gen, fast & stable" },
  { value: "kling-1.5", label: "Kling 1.5", badge: "Fast & Light", desc: "Lightweight, quick iterations" },
];

const VEO_MODEL_OPTIONS: { value: VeoModel; label: string; badge: string; desc: string }[] = [
  {
    value: "veo-2.0-generate-001",
    label: "Veo 2.0",
    badge: "Fast & Reliable",
    desc:  "Best for quick iterations and reliable results",
  },
  {
    value: "veo-3.0-generate-preview",
    label: "Veo 3.0 Preview",
    badge: "Higher Quality",
    desc:  "Improved realism, better prompt adherence",
  },
  {
    value: "veo-3.1-generate-preview",
    label: "Veo 3.1 Preview",
    badge: "Latest",
    desc:  "Most powerful model, highest quality output",
  },
];

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9",  label: "16:9",  desc: "Landscape"    },
  { value: "9:16",  label: "9:16",  desc: "Portrait"     },
  { value: "1:1",   label: "1:1",   desc: "Square"       },
  { value: "21:9",  label: "21:9",  desc: "Ultrawide"    },
  { value: "4:3",   label: "4:3",   desc: "Classic"      },
];

const VIDEO_DURATION_OPTIONS = [
  { value: 5,  label: "5s",  desc: "Short"    },
  { value: 8,  label: "8s",  desc: "Standard" },
  { value: 10, label: "10s", desc: "Extended" },
];

const CAMERA_MOVEMENT_OPTIONS = [
  { value: "static",        label: "Static",        desc: "Locked, no movement" },
  { value: "slow_pan",      label: "Slow Pan",       desc: "Gentle horizontal sweep" },
  { value: "dolly_in",      label: "Dolly In",       desc: "Push toward subject" },
  { value: "dolly_out",     label: "Dolly Out",      desc: "Pull away dramatically" },
  { value: "crane",         label: "Crane Shot",     desc: "Sweeping vertical arc" },
  { value: "orbit",         label: "Orbit",          desc: "Revolve around subject" },
  { value: "handheld",      label: "Handheld",       desc: "Intimate, natural shake" },
  { value: "epic_tracking", label: "Epic Tracking",  desc: "Dynamic follow shot" },
];

const LIGHTING_OPTIONS = [
  { value: "soft_natural", label: "Soft Natural",    desc: "Diffused daylight"    },
  { value: "golden_hour",  label: "Golden Hour",     desc: "Warm amber tones"     },
  { value: "dramatic",     label: "Dramatic Cinema", desc: "High-contrast shadows" },
  { value: "studio",       label: "Studio Lighting", desc: "Clean, controlled"    },
  { value: "neon",         label: "Neon Cyberpunk",  desc: "Vibrant urban glow"   },
  { value: "moody_low_key",label: "Moody Low-Key",   desc: "Dark, mysterious"     },
];

const VISUAL_STYLE_OPTIONS = [
  { value: "photorealistic", label: "Photorealistic",     desc: "True-to-life realism"      },
  { value: "cinematic",      label: "Hollywood Cinematic", desc: "Movie-grade look"          },
  { value: "commercial",     label: "Commercial Ad",       desc: "Polished brand-safe"       },
  { value: "artistic",       label: "Artistic Film",       desc: "Painterly, expressive"     },
  { value: "documentary",    label: "Documentary",         desc: "Authentic, observational"  },
  { value: "anime",          label: "Anime",               desc: "Vibrant animation style"   },
];

const IMAGE_STYLE_OPTIONS = [
  { value: "photorealistic", label: "Photorealistic", desc: "True-to-life photo"   },
  { value: "cinematic",      label: "Cinematic",      desc: "Movie still quality"  },
  { value: "commercial",     label: "Commercial",     desc: "Brand-safe, polished" },
  { value: "artistic",       label: "Artistic",       desc: "Fine art aesthetic"   },
  { value: "illustration",   label: "Illustration",   desc: "Digital art"          },
  { value: "3d_render",      label: "3D Render",      desc: "CGI quality"          },
  { value: "anime",          label: "Anime",          desc: "Vibrant anime style"  },
];

const QUALITY_OPTIONS = [
  { value: "standard", label: "Standard", desc: "Fast generation"          },
  { value: "high",     label: "High",     desc: "Sharp, professional"      },
  { value: "ultra",    label: "Ultra",    desc: "4K cinematic masterpiece" },
];

const IMAGE_COUNT_OPTIONS = [
  { value: 1, label: "1" }, { value: 2, label: "2" },
  { value: 3, label: "3" }, { value: 4, label: "4" },
];

// Motion slider: 10 positions → 5 named presets
const MOTION_PRESETS: { value: MotionStrength; label: string; sliderPos: number }[] = [
  { value: "subtle",    label: "Subtle",    sliderPos: 1  },
  { value: "medium",    label: "Medium",    sliderPos: 3  },
  { value: "dynamic",   label: "Dynamic",   sliderPos: 5  },
  { value: "cinematic", label: "Cinematic", sliderPos: 7  },
  { value: "epic",      label: "Epic",      sliderPos: 9  },
];

function motionToSlider(m: MotionStrength): number {
  return MOTION_PRESETS.find((p) => p.value === m)?.sliderPos ?? 3;
}

function sliderToMotion(v: number): MotionStrength {
  if (v <= 1) return "subtle";
  if (v <= 3) return "medium";
  if (v <= 5) return "dynamic";
  if (v <= 7) return "cinematic";
  return "epic";
}

// ── Micro-components ──────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-xs text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

function FieldLabel({
  label, tooltip, icon: Icon,
}: { label: string; tooltip?: string; icon?: React.ElementType }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
      {Icon && <Icon className="h-3 w-3 text-slate-500" />}
      {label}
      {tooltip && (
        <Tooltip text={tooltip}>
          <Info className="h-3 w-3 cursor-help text-slate-600 hover:text-slate-400 transition-colors" />
        </Tooltip>
      )}
    </label>
  );
}

function Select({
  label, tooltip, icon, value, onChange, options,
}: {
  label: string; tooltip?: string; icon?: React.ElementType;
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string; desc?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} tooltip={tooltip} icon={icon} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:border-slate-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}{o.desc ? ` — ${o.desc}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  checked, onChange, label, description,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? "bg-indigo-600" : "bg-slate-700"}`}>
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </span>
      <span>
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        {description && <span className="block text-[10px] text-slate-500">{description}</span>}
      </span>
    </button>
  );
}

// ── Pill button group ──────────────────────────────────────────────────────────────

function PillGroup<T extends string | number>({
  label, tooltip, icon, value, onChange, options,
}: {
  label: string; tooltip?: string; icon?: React.ElementType;
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string; desc?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} tooltip={tooltip} icon={icon} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              value === o.value
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/50"
                : "border border-slate-700/60 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Motion strength slider ─────────────────────────────────────────────────────────

function MotionSlider({
  value, onChange,
}: { value: MotionStrength; onChange: (v: MotionStrength) => void }) {
  const sliderVal = motionToSlider(value);

  return (
    <div className="space-y-2">
      <FieldLabel
        label="Motion Strength"
        icon={Wind}
        tooltip="Overall intensity of movement and energy within the scene."
      />
      <div className="space-y-2 rounded-lg border border-slate-700/60 bg-slate-800/60 px-4 py-3">
        {/* Slider */}
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={sliderVal}
          onChange={(e) => onChange(sliderToMotion(Number(e.target.value)))}
          className="motion-slider w-full cursor-pointer"
        />
        {/* Preset labels */}
        <div className="flex justify-between">
          {MOTION_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={`text-[10px] font-medium transition-colors ${
                value === p.value ? "text-indigo-400" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Active badge */}
        <div className="flex justify-center">
          <span className="rounded-full bg-indigo-900/40 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-800/50">
            {MOTION_PRESETS.find((p) => p.value === value)?.label ?? "Medium"}
            {" "}· {sliderVal}/10
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Image drop zone ────────────────────────────────────────────────────────────────

function ImageDropZone({
  label, tooltip, icon: Icon = Upload,
  file, onFile, onClear,
  accept = "image/jpeg,image/png,image/webp",
  hint = "JPEG, PNG, WebP",
}: {
  label: string; tooltip?: string; icon?: React.ElementType;
  file: MediaFile | null;
  onFile: (mf: MediaFile) => void;
  onClear: () => void;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(f: File) {
    const b64 = await fileToBase64(f);
    const objectUrl = URL.createObjectURL(f);
    onFile({ file: f, b64, objectUrl });
  }

  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} tooltip={tooltip} icon={Icon} />

      {file ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-700/60 bg-slate-800/60">
          {/* Preview */}
          <img
            src={file.objectUrl}
            alt="preview"
            className="h-24 w-full object-cover"
          />
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-900/80 to-transparent p-2">
            <span className="truncate text-[10px] text-slate-300">{file.file.name}</span>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-slate-300 hover:bg-red-900/80 hover:text-red-300 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-4 text-center transition-colors ${
            dragging
              ? "border-indigo-500 bg-indigo-900/20"
              : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60"
          }`}
        >
          <Icon className="h-5 w-5 text-slate-500" />
          <span className="text-[10px] text-slate-500">Click or drag · {hint}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

// ── Multi image drop zone ──────────────────────────────────────────────────────────

function MultiImageDropZone({
  files, onAdd, onRemove, maxFiles = 4,
}: {
  files:    MediaFile[];
  onAdd:    (mf: MediaFile) => void;
  onRemove: (index: number) => void;
  maxFiles?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(fileList: FileList) {
    const remaining = maxFiles - files.length;
    const toProcess = Array.from(fileList).slice(0, remaining);
    for (const f of toProcess) {
      const b64 = await fileToBase64(f);
      const objectUrl = URL.createObjectURL(f);
      onAdd({ file: f, b64, objectUrl });
    }
  }

  return (
    <div className="space-y-1.5">
      <FieldLabel
        label={`Reference Images (${files.length}/${maxFiles})`}
        icon={ImageIcon}
        tooltip="Upload 1–4 reference images for visual style/scene guidance. The first image conditions the Veo generation."
      />

      <div className="space-y-2">
        {/* Thumbnails */}
        {files.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {files.map((mf, i) => (
              <div key={i} className="group relative overflow-hidden rounded-lg border border-slate-700/60">
                <img src={mf.objectUrl} alt={`ref ${i + 1}`} className="h-16 w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-red-900/80 text-red-300 hover:bg-red-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <span className="absolute bottom-0 left-0 right-0 bg-slate-900/70 py-0.5 text-center text-[9px] text-slate-400">
                  Ref {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Add zone */}
        {files.length < maxFiles && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-center transition-colors ${
              dragging
                ? "border-indigo-500 bg-indigo-900/20"
                : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
            }`}
          >
            <Upload className="h-4 w-4 text-slate-500" />
            <span className="text-[10px] text-slate-500">
              Add image{files.length > 0 ? ` (${maxFiles - files.length} remaining)` : "s"} · JPEG, PNG, WebP
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
      />
    </div>
  );
}

// ── Veo model selector ─────────────────────────────────────────────────────────────

function VeoModelSelector({
  value, onChange,
}: { value: VeoModel; onChange: (v: VeoModel) => void }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel
        label="Veo Model"
        icon={Cpu}
        tooltip="Select the Veo model version. Newer models produce higher quality but may take longer."
      />
      <div className="grid grid-cols-1 gap-2">
        {VEO_MODEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
              value === opt.value
                ? "border-indigo-600/60 bg-indigo-900/30 ring-1 ring-indigo-600/40"
                : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60"
            }`}
          >
            <div>
              <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
              <span className="ml-2 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                {opt.badge}
              </span>
              <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
            </div>
            {value === opt.value && (
              <div className="ml-2 h-2 w-2 rounded-full bg-indigo-400 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Generation provider selector ──────────────────────────────────────────────────

function ProviderSelector({
  value, onChange,
}: { value: ModelProvider; onChange: (v: ModelProvider) => void }) {
  return (
    <div className="space-y-1.5">
      <FieldLabel
        label="Generation Provider"
        icon={Clapperboard}
        tooltip="Choose which AI model generates the video. Kling 3.0 excels at copying UGC subject style; Veo produces the highest cinematic quality."
      />
      <div className="grid grid-cols-1 gap-2">
        {PROVIDER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-start justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
              value === opt.value
                ? opt.value === "kling"
                  ? "border-emerald-600/60 bg-emerald-900/20 ring-1 ring-emerald-600/40"
                  : "border-indigo-600/60 bg-indigo-900/30 ring-1 ring-indigo-600/40"
                : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${opt.badgeColor}`}>
                  {opt.badge}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">{opt.desc}</p>
              {opt.warning && (
                <div className="mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" />
                  <span className="text-[9px] text-amber-500">{opt.warning}</span>
                </div>
              )}
            </div>
            {value === opt.value && (
              <div className={`ml-2 mt-1 h-2 w-2 rounded-full flex-shrink-0 ${opt.value === "kling" ? "bg-emerald-400" : "bg-indigo-400"}`} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── Kling settings panel ───────────────────────────────────────────────────────────

function KlingSlider({
  label, tooltip, icon: Icon, value, onChange, min = 0, max = 1, step = 0.05,
  formatValue,
}: {
  label: string; tooltip?: string; icon?: React.ElementType;
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  formatValue?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = formatValue ? formatValue(value) : `${Math.round(value * 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel label={label} tooltip={tooltip} icon={Icon} />
        <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
          {display}
        </span>
      </div>
      <div className="space-y-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-4 py-3">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="kling-slider w-full cursor-pointer accent-emerald-500"
        />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>{min === 0 ? "Off / Creative" : String(min)}</span>
          <span>{max === 1 ? "Max / Strict" : String(max)}</span>
        </div>
      </div>
    </div>
  );
}

function KlingPanel({
  params, onChange,
}: {
  params: KlingParams;
  onChange: <K extends keyof KlingParams>(k: K, v: KlingParams[K]) => void;
}) {
  const [showKlingRef, setShowKlingRef] = useState(false);
  const [refImage, setRefImage]         = useState<MediaFile | null>(null);
  const [condImage, setCondImage]       = useState<MediaFile | null>(null);

  function setRef(mf: MediaFile) {
    setRefImage(mf);
    onChange("reference_image_b64", mf.b64);
  }
  function clearRef() {
    setRefImage(null);
    onChange("reference_image_b64", null);
  }
  function setCond(mf: MediaFile) {
    setCondImage(mf);
    onChange("conditioning_image_b64", mf.b64);
  }
  function clearCond() {
    setCondImage(null);
    onChange("conditioning_image_b64", null);
  }

  return (
    <div className="space-y-4 rounded-xl border border-emerald-800/30 bg-emerald-900/10 p-4">

      {/* Header badge */}
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-emerald-700/40 bg-emerald-900/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
          Kling 3.0 — Best for copying existing UGC style
        </span>
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <FieldLabel label="Kling Model" icon={Cpu} tooltip="Select Kling model version. 3.0 is the most powerful." />
        <div className="grid grid-cols-1 gap-1.5">
          {KLING_MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange("kling_model", opt.value)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-all ${
                params.kling_model === opt.value
                  ? "border-emerald-600/60 bg-emerald-900/30 ring-1 ring-emerald-600/30"
                  : "border-slate-700/60 bg-slate-800/40 hover:border-slate-600"
              }`}
            >
              <div>
                <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                <span className="ml-2 rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
                  {opt.badge}
                </span>
                <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
              </div>
              {params.kling_model === opt.value && (
                <div className="ml-2 h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Duration + Aspect */}
      <div className="grid grid-cols-2 gap-3">
        <PillGroup
          label="Duration"
          icon={Clock}
          tooltip="Kling supports 5 or 10 second clips."
          value={params.duration}
          onChange={(v) => onChange("duration", v as 5 | 10)}
          options={[{ value: 5, label: "5s", desc: "Short" }, { value: 10, label: "10s", desc: "Extended" }]}
        />
        <PillGroup
          label="Aspect Ratio"
          icon={Maximize2}
          tooltip="Frame dimensions. 9:16 for vertical Reels."
          value={params.aspect_ratio}
          onChange={(v) => onChange("aspect_ratio", v as KlingParams["aspect_ratio"])}
          options={[
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "1:1",  label: "1:1"  },
          ]}
        />
      </div>

      {/* Subject consistency + Motion intensity */}
      <KlingSlider
        label="Subject Consistency"
        icon={Users}
        tooltip="How strictly the video follows subject/style from your reference. Higher = more faithful to reference."
        value={params.cfg_scale}
        onChange={(v) => onChange("cfg_scale", v)}
      />

      <KlingSlider
        label="Motion Intensity"
        icon={Wind}
        tooltip="Overall motion energy. Below 50% = Standard mode (calm). Above 50% = Pro mode (dynamic)."
        value={params.motion_intensity}
        onChange={(v) => onChange("motion_intensity", v)}
        formatValue={(v) => v > 0.5 ? `${Math.round(v * 100)}% (Pro)` : `${Math.round(v * 100)}% (Std)`}
      />

      {/* Reference media */}
      <div className="rounded-xl border border-slate-700/40 bg-slate-800/30">
        <button
          type="button"
          onClick={() => setShowKlingRef(!showKlingRef)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <Upload className="h-3 w-3" />
            Reference Media
            {(refImage || condImage) && (
              <span className="rounded-full bg-emerald-900/50 px-1.5 py-0.5 text-[9px] text-emerald-400 border border-emerald-800/40">
                {[refImage && "ref", condImage && "start"].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          {showKlingRef
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          }
        </button>

        {showKlingRef && (
          <div className="space-y-4 border-t border-slate-700/40 px-4 pb-4 pt-3">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Upload a frame from your source UGC to match its subject/style, or a conditioning image
              to pin the opening frame (triggers image-to-video mode).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ImageDropZone
                label="UGC Reference Frame"
                icon={Users}
                tooltip="A frame from your source UGC video. Kling uses this for subject/style consistency across the generated clip."
                file={refImage}
                onFile={setRef}
                onClear={clearRef}
              />
              <ImageDropZone
                label="Start Frame"
                icon={Play}
                tooltip="Pin the opening frame of the video (switches to image-to-video mode)."
                file={condImage}
                onFile={setCond}
                onClear={clearCond}
              />
            </div>
          </div>
        )}
      </div>

      {/* Negative prompt */}
      <div className="space-y-1.5">
        <FieldLabel label="Negative Prompt" icon={Ban} tooltip="What to exclude from the video." />
        <textarea
          value={params.negative_prompt ?? ""}
          onChange={(e) => onChange("negative_prompt", e.target.value || null)}
          placeholder="blurry, watermarks, text overlays, distorted faces, low quality…"
          rows={2}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        />
      </div>
    </div>
  );
}


// ── Live preview panel ─────────────────────────────────────────────────────────────

function PreviewCard({
  mode, videoParams, imageParams, enhancePrompt, prompt,
  refImageCount, hasStartCard, hasEndCard,
}: {
  mode:           GenerationMode;
  videoParams:    VideoParams;
  imageParams:    ImageParams;
  enhancePrompt:  boolean;
  prompt:         string;
  refImageCount:  number;
  hasStartCard:   boolean;
  hasEndCard:     boolean;
}) {
  const isVideo = mode === "video";

  const modelLabel = VEO_MODEL_OPTIONS.find((o) => o.value === videoParams.veo_model)?.label ?? videoParams.veo_model;
  const cameraLabel = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === videoParams.camera_movement)?.label ?? videoParams.camera_movement;
  const lightLabel  = LIGHTING_OPTIONS.find((o) => o.value === videoParams.lighting_style)?.label ?? videoParams.lighting_style;
  const styleLabel  = VISUAL_STYLE_OPTIONS.find((o) => o.value === videoParams.visual_style)?.label ?? videoParams.visual_style;
  const motionLabel = MOTION_PRESETS.find((p) => p.value === videoParams.motion_strength)?.label ?? videoParams.motion_strength;
  const imgStyleLabel = IMAGE_STYLE_OPTIONS.find((o) => o.value === imageParams.style)?.label ?? imageParams.style;

  const videoRows = [
    { label: "Model",    value: modelLabel },
    { label: "Duration", value: `${videoParams.duration}s` },
    { label: "Aspect",   value: videoParams.aspect_ratio },
    { label: "Camera",   value: cameraLabel },
    { label: "Motion",   value: motionLabel },
    { label: "Lighting", value: lightLabel },
    { label: "Style",    value: styleLabel },
    { label: "Quality",  value: videoParams.quality.charAt(0).toUpperCase() + videoParams.quality.slice(1) },
  ];

  const imageRows = [
    { label: "Aspect",   value: imageParams.aspect_ratio },
    { label: "Style",    value: imgStyleLabel },
    { label: "Quality",  value: imageParams.quality.charAt(0).toUpperCase() + imageParams.quality.slice(1) },
    { label: "Count",    value: `${imageParams.number_of_images} image${imageParams.number_of_images > 1 ? "s" : ""}` },
  ];

  const rows = isVideo ? videoRows : imageRows;

  const mediaBadges: string[] = [];
  if (isVideo) {
    if (refImageCount > 0) mediaBadges.push(`${refImageCount} ref img`);
    if (hasStartCard) mediaBadges.push("start card");
    if (hasEndCard)   mediaBadges.push("end card");
  }

  return (
    <div className="sticky top-4 space-y-4 rounded-xl border border-slate-700/60 bg-slate-900/80 p-4 backdrop-blur">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isVideo ? "bg-indigo-600" : "bg-purple-600"}`}>
          {isVideo ? <Film className="h-4 w-4 text-white" /> : <ImageIcon className="h-4 w-4 text-white" />}
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Live Preview</p>
          <p className="text-xs font-semibold text-slate-200">{isVideo ? "Video" : "Image"} Generation</p>
        </div>
      </div>

      {/* Prompt preview */}
      {prompt && (
        <div className="rounded-lg border border-slate-700/40 bg-slate-800/60 p-2.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Prompt</p>
          <p className="line-clamp-3 text-[10px] leading-relaxed text-slate-400">{prompt}</p>
        </div>
      )}

      {/* Parameters */}
      <div className="space-y-1.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">{label}</span>
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 max-w-[120px] truncate text-right">
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Media badges */}
      {mediaBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mediaBadges.map((b) => (
            <span key={b} className="rounded-full border border-indigo-800/40 bg-indigo-900/30 px-2 py-0.5 text-[9px] font-medium text-indigo-400">
              {b}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-slate-800" />

      {/* Enhancement status */}
      <div className="flex items-center gap-2">
        {enhancePrompt ? (
          <>
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] text-amber-300">Gemini enhancement ON</span>
          </>
        ) : (
          <>
            <EyeOff className="h-3 w-3 text-slate-500" />
            <span className="text-[10px] text-slate-500">Raw mode — no enhancement</span>
          </>
        )}
      </div>

      {/* Time estimate */}
      <div className="flex items-center gap-2">
        <Clock className="h-3 w-3 text-slate-500" />
        <span className="text-[10px] text-slate-500">
          {isVideo ? "Est. 2–5 min (async)" : "Est. 5–20 sec (sync)"}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────────

export function GenerationForm({ brands, onGenerated }: GenerationFormProps) {
  const [mode, setMode] = useState<GenerationMode>("video");

  // Provider — persisted in localStorage
  const [provider, setProvider] = useState<ModelProvider>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vbg_provider");
      if (saved === "kling" || saved === "veo") return saved;
    }
    return "veo";
  });

  function handleProviderChange(v: ModelProvider) {
    setProvider(v);
    if (typeof window !== "undefined") {
      localStorage.setItem("vbg_provider", v);
    }
  }

  // Brand
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const effectiveBrandId = selectedBrandId || brands[0]?.id || "";
  const selectedBrand = brands.find((b) => b.id === effectiveBrandId);

  // Prompt
  const [prompt, setPrompt] = useState("");
  const [enhancePrompt, setEnhancePrompt] = useState(true);

  // Veo video params
  const [videoParams, setVideoParams] = useState<VideoParams>(DEFAULT_VIDEO_PARAMS);
  const setVP = useCallback(
    <K extends keyof VideoParams>(key: K, value: VideoParams[K]) =>
      setVideoParams((p) => ({ ...p, [key]: value })),
    [],
  );

  // Kling params
  const [klingParams, setKlingParams] = useState<KlingParams>(DEFAULT_KLING_PARAMS);
  const setKP = useCallback(
    <K extends keyof KlingParams>(key: K, value: KlingParams[K]) =>
      setKlingParams((p) => ({ ...p, [key]: value })),
    [],
  );

  // Image params
  const [imageParams, setImageParams] = useState<ImageParams>(DEFAULT_IMAGE_PARAMS);
  const setIP = useCallback(
    <K extends keyof ImageParams>(key: K, value: ImageParams[K]) =>
      setImageParams((p) => ({ ...p, [key]: value })),
    [],
  );

  // Reference media state (Veo)
  const [referenceImages, setReferenceImages] = useState<MediaFile[]>([]);
  const [startCard, setStartCard]             = useState<MediaFile | null>(null);
  const [endCard, setEndCard]                 = useState<MediaFile | null>(null);

  // Panel toggles
  const [showMedia, setShowMedia]       = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Submit
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const isVideo   = mode === "video";
  const isKling   = isVideo && provider === "kling";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !effectiveBrandId) return;

    setLoading(true);
    setError(null);

    let req: GenerateRequest;

    if (isVideo && provider === "kling") {
      req = {
        brand_id:       effectiveBrandId,
        mode:           "video",
        model_provider: "kling",
        user_prompt:    prompt.trim(),
        enhance_prompt: enhancePrompt,
        kling_params:   klingParams,
      };
    } else if (isVideo) {
      const finalVideoParams: VideoParams = {
        ...videoParams,
        reference_images_b64: referenceImages.length > 0 ? referenceImages.map((r) => r.b64) : null,
        start_card_b64:       startCard?.b64 ?? null,
        end_card_b64:         endCard?.b64 ?? null,
      };
      req = {
        brand_id:       effectiveBrandId,
        mode:           "video",
        model_provider: "veo",
        user_prompt:    prompt.trim(),
        enhance_prompt: enhancePrompt,
        video_params:   finalVideoParams,
      };
    } else {
      req = {
        brand_id:       effectiveBrandId,
        mode:           "image",
        user_prompt:    prompt.trim(),
        enhance_prompt: enhancePrompt,
        image_params:   imageParams,
      };
    }

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

  const canSubmit = !loading && prompt.trim().length >= 10 && !!effectiveBrandId;

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 shadow-2xl shadow-black/40 backdrop-blur">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-900/40">
            <Wand2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Create with AI</h2>
            <p className="text-[10px] text-slate-500">Google Veo 3.1 · Kling 3.0 · Imagen 3 · Gemini</p>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_200px]">

        {/* ── Left: Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-5 border-r border-slate-800/60 p-5">

          {/* Mode segmented control */}
          <div className="flex rounded-xl border border-slate-700/60 bg-slate-800/60 p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode("video")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                isVideo
                  ? "bg-indigo-600 text-white shadow shadow-indigo-900/50"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              Generate Video
            </button>
            <button
              type="button"
              onClick={() => setMode("image")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-all ${
                !isVideo
                  ? "bg-purple-600 text-white shadow shadow-purple-900/50"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Generate Image
            </button>
          </div>

          {/* Provider selector — only relevant for video */}
          {isVideo && (
            <ProviderSelector value={provider} onChange={handleProviderChange} />
          )}

          {/* Brand selector */}
          <div className="space-y-1.5">
            <FieldLabel label="Brand" tooltip="Your brand defines visual identity, style guide, and reference images used in generation." />
            {brands.length === 0 ? (
              <p className="text-xs text-amber-400">⚠ Create a brand first using the Brand Dashboard.</p>
            ) : (
              <select
                value={effectiveBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="w-full rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.reference_images.length > 0 ? ` (${b.reference_images.length} ref)` : ""}
                  </option>
                ))}
              </select>
            )}
            {selectedBrand && (selectedBrand.reference_images.length > 0 || selectedBrand.style_guide) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {selectedBrand.reference_images.map((_, i) => (
                  <span key={i} className="rounded-full border border-indigo-800/40 bg-indigo-900/30 px-2 py-0.5 text-[10px] text-indigo-400">
                    🖼 Ref {i + 1}
                  </span>
                ))}
                {selectedBrand.style_guide && (
                  <span className="rounded-full border border-purple-800/40 bg-purple-900/30 px-2 py-0.5 text-[10px] text-purple-400">
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
                  ? "A chef in a modern kitchen preparing a vibrant salad, golden light streaming through the window…"
                  : "A sleek product bottle on a marble surface, soft studio lighting, minimalist background…"
              }
              rows={3}
              required
              minLength={10}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <div className="flex justify-between text-[10px] text-slate-600">
              <span>{prompt.length < 10 && prompt.length > 0 ? `${10 - prompt.length} more chars required` : ""}</span>
              <span>{prompt.length}/1000</span>
            </div>
          </div>

          {/* ── VIDEO SETTINGS ─────────────────────────────────────────────────── */}
          {isVideo && (
            <div className="space-y-5">

              {/* ── Kling settings (shown when Kling is selected) ──────────────── */}
              {isKling && (
                <KlingPanel params={klingParams} onChange={setKP} />
              )}

              {/* ── Veo settings (shown when Veo is selected) ─────────────────── */}
              {!isKling && (
              <>

              {/* Section: Model & Output */}
              <div className="space-y-4 rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
                <SectionLabel><Cpu className="h-3 w-3" />Model &amp; Output</SectionLabel>

                <VeoModelSelector
                  value={videoParams.veo_model as VeoModel}
                  onChange={(v) => setVP("veo_model", v)}
                />

                <div className="grid grid-cols-3 gap-3">
                  <PillGroup
                    label="Duration"
                    icon={Clock}
                    tooltip="How long the generated video will be. Longer durations take more time."
                    value={videoParams.duration}
                    onChange={(v) => setVP("duration", v as 5 | 8 | 10)}
                    options={VIDEO_DURATION_OPTIONS}
                  />
                  <PillGroup
                    label="Aspect Ratio"
                    icon={Maximize2}
                    tooltip="Frame dimensions. 16:9 for widescreen, 9:16 for vertical Reels."
                    value={videoParams.aspect_ratio}
                    onChange={(v) => setVP("aspect_ratio", v as VideoParams["aspect_ratio"])}
                    options={ASPECT_RATIO_OPTIONS}
                  />
                  <PillGroup
                    label="Quality"
                    icon={Star}
                    tooltip="Output quality level. Ultra produces sharper results but takes longer."
                    value={videoParams.quality}
                    onChange={(v) => setVP("quality", v as VideoParams["quality"])}
                    options={QUALITY_OPTIONS}
                  />
                </div>
              </div>

              {/* Section: Camera & Motion */}
              <div className="space-y-4 rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
                <SectionLabel><Camera className="h-3 w-3" />Camera &amp; Motion</SectionLabel>

                <Select
                  label="Camera Movement"
                  icon={Camera}
                  tooltip="How the virtual camera moves. Adds cinematic dynamism to the shot."
                  value={videoParams.camera_movement}
                  onChange={(v) => setVP("camera_movement", v as VideoParams["camera_movement"])}
                  options={CAMERA_MOVEMENT_OPTIONS}
                />

                <MotionSlider
                  value={videoParams.motion_strength}
                  onChange={(v) => setVP("motion_strength", v)}
                />
              </div>

              {/* Section: Look & Feel */}
              <div className="space-y-4 rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
                <SectionLabel><Palette className="h-3 w-3" />Look &amp; Feel</SectionLabel>

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Lighting Style"
                    icon={Sun}
                    tooltip="The primary lighting setup. Sets the mood and atmosphere."
                    value={videoParams.lighting_style}
                    onChange={(v) => setVP("lighting_style", v as VideoParams["lighting_style"])}
                    options={LIGHTING_OPTIONS}
                  />
                  <Select
                    label="Cinematic Style"
                    icon={Palette}
                    tooltip="The overall aesthetic treatment applied to the video."
                    value={videoParams.visual_style}
                    onChange={(v) => setVP("visual_style", v as VideoParams["visual_style"])}
                    options={VISUAL_STYLE_OPTIONS}
                  />
                </div>
              </div>

              {/* Section: Reference Media (collapsible) */}
              <div className="rounded-xl border border-slate-700/40 bg-slate-800/30">
                <button
                  type="button"
                  onClick={() => setShowMedia(!showMedia)}
                  className="flex w-full items-center justify-between px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <Upload className="h-3 w-3" />
                    Reference Media
                    {(referenceImages.length > 0 || startCard || endCard) && (
                      <span className="rounded-full bg-indigo-900/50 px-1.5 py-0.5 text-[9px] text-indigo-400 border border-indigo-800/40">
                        {[
                          referenceImages.length > 0 && `${referenceImages.length} img`,
                          startCard && "start",
                          endCard && "end",
                        ].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {showMedia
                    ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                    : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  }
                </button>

                {showMedia && (
                  <div className="space-y-4 border-t border-slate-700/40 px-4 pb-4 pt-3">
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Reference images condition Veo's visual output — the first image acts as the primary
                      style guide. Start card defines the opening frame.
                    </p>

                    {/* Reference images (multi) */}
                    <MultiImageDropZone
                      files={referenceImages}
                      onAdd={(mf) => setReferenceImages((prev) => [...prev, mf].slice(0, 4))}
                      onRemove={(i) => setReferenceImages((prev) => prev.filter((_, idx) => idx !== i))}
                      maxFiles={4}
                    />

                    {/* Start card / End card */}
                    <div className="grid grid-cols-2 gap-3">
                      <ImageDropZone
                        label="Start Card"
                        icon={Play}
                        tooltip="The opening frame. Highest priority conditioning image for Veo."
                        file={startCard}
                        onFile={(mf) => setStartCard(mf)}
                        onClear={() => setStartCard(null)}
                      />
                      <ImageDropZone
                        label="End Card"
                        icon={SquarePlay}
                        tooltip="Guides the desired closing scene. Included as a prompt hint."
                        file={endCard}
                        onFile={(mf) => setEndCard(mf)}
                        onClear={() => setEndCard(null)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* end !isKling Veo-only block */}
              </>)}
            </div>
          )}

          {/* ── IMAGE SETTINGS ─────────────────────────────────────────────────── */}
          {!isVideo && (
            <div className="space-y-4 rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
              <SectionLabel><ImageIcon className="h-3 w-3" />Image Settings</SectionLabel>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Aspect Ratio"
                  icon={Maximize2}
                  tooltip="16:9 for landscape, 9:16 for portrait, 1:1 for square."
                  value={imageParams.aspect_ratio}
                  onChange={(v) => setIP("aspect_ratio", v as ImageParams["aspect_ratio"])}
                  options={ASPECT_RATIO_OPTIONS.filter((o) => o.value !== "21:9")}
                />
                <div className="space-y-1.5">
                  <FieldLabel label="Number of Images" icon={Layers} tooltip="How many variations to generate." />
                  <div className="flex gap-1.5">
                    {IMAGE_COUNT_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setIP("number_of_images", o.value as 1 | 2 | 3 | 4)}
                        className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                          imageParams.number_of_images === o.value
                            ? "bg-purple-600 text-white"
                            : "border border-slate-700/60 bg-slate-800/60 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Style"
                  icon={Palette}
                  tooltip="The visual aesthetic of the generated image."
                  value={imageParams.style}
                  onChange={(v) => setIP("style", v as ImageParams["style"])}
                  options={IMAGE_STYLE_OPTIONS}
                />
                <Select
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

          {/* ── Advanced options ────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/30">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <Hash className="h-3 w-3" />Advanced Options
              </span>
              {showAdvanced
                ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              }
            </button>

            {showAdvanced && (
              <div className="space-y-3 border-t border-slate-700/40 px-4 pb-4 pt-3">
                {/* Seed */}
                <div className="space-y-1.5">
                  <FieldLabel label="Seed" icon={Hash} tooltip="Fixed seed for reproducible results. Leave blank for random." />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Random"
                      value={isVideo ? (videoParams.seed ?? "") : (imageParams.seed ?? "")}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        isVideo ? setVP("seed", v) : setIP("seed", v);
                      }}
                      className="flex-1 rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = Math.floor(Math.random() * 2147483647);
                        isVideo ? setVP("seed", v) : setIP("seed", v);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-[10px] text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />Random
                    </button>
                  </div>
                </div>

                {/* Negative prompt */}
                <div className="space-y-1.5">
                  <FieldLabel label="Negative Prompt" icon={Ban} tooltip="What to exclude: e.g. 'blurry, text overlays, watermarks, distorted faces'." />
                  <textarea
                    value={isVideo ? (videoParams.negative_prompt ?? "") : (imageParams.negative_prompt ?? "")}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      isVideo ? setVP("negative_prompt", v) : setIP("negative_prompt", v);
                    }}
                    placeholder="blurry, watermarks, text overlays, distorted faces, low quality…"
                    rows={2}
                    maxLength={500}
                    className="w-full resize-none rounded-lg border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Gemini toggles ─────────────────────────────────────────────────── */}
          <div className="space-y-2.5 rounded-xl border border-slate-700/40 bg-slate-800/30 p-4">
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
              <div className="flex items-center gap-2 rounded-lg bg-amber-900/20 border border-amber-800/30 px-3 py-2">
                <Zap className="h-3 w-3 text-amber-400 flex-shrink-0" />
                <span className="text-[10px] text-amber-300">
                  Raw mode: prompt sent directly to {isVideo ? "Veo" : "Imagen"}.
                </span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-800/40 bg-red-900/20 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none ${
              !isVideo
                ? "bg-gradient-to-r from-purple-600 to-purple-700 shadow-purple-900/40 hover:from-purple-500 hover:to-purple-600"
                : isKling
                  ? "bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-600"
                  : "bg-gradient-to-r from-indigo-600 to-indigo-700 shadow-indigo-900/40 hover:from-indigo-500 hover:to-indigo-600"
            }`}
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {!isVideo
                  ? "Generating with Imagen…"
                  : isKling
                    ? "Submitting to Kling…"
                    : "Submitting to Veo…"
                }
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {!isVideo
                  ? "Generate Image"
                  : isKling
                    ? "Generate with Kling 3.0"
                    : "Generate with Veo"
                }
              </>
            )}
          </button>
        </form>

        {/* ── Right: live preview ─────────────────────────────────────────────── */}
        <div className="p-4">
          <PreviewCard
            mode={mode}
            videoParams={videoParams}
            imageParams={imageParams}
            enhancePrompt={enhancePrompt}
            prompt={prompt}
            refImageCount={referenceImages.length}
            hasStartCard={!!startCard}
            hasEndCard={!!endCard}
          />
        </div>
      </div>
    </div>
  );
}
