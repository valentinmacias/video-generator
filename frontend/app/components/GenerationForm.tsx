"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ImageIcon, Film, Upload, X, Play, Check,
  Wand2, ChevronDown, Camera, Zap, RotateCcw,
  Mic, Download, AlertCircle, Clock, Loader2, Settings2,
} from "lucide-react";
import { clsx } from "clsx";
import {
  Brand, GenerateResponse, GenerateRequest,
  VideoParams, ImageParams, RunwayParams, KlingParams, ModelProvider,
  DEFAULT_VIDEO_PARAMS, DEFAULT_IMAGE_PARAMS, DEFAULT_RUNWAY_PARAMS, DEFAULT_KLING_PARAMS,
  VeoModel, RunwayModel,
  generateAsset, fileToBase64, getVideo, VideoStatus,
} from "../lib/api";
import { CircularProgress } from "./CircularProgress";
import { VoiceoverModal } from "./VoiceoverModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenerationFormProps {
  brands:      Brand[];
  onGenerated: (response: GenerateResponse) => void;
}

type TabMode = "video" | "image";

// Video mode phases
type VideoPhase = "setup" | "gen-ref" | "pick-ref" | "animating" | "done";
// Image mode phases
type ImagePhase = "setup" | "generating" | "done";

interface RefImage {
  id:       string;
  url:      string | null;
  b64:      string | null;
  loading:  boolean;
  error?:   string;
}

interface VideoResult {
  slotId:   string;
  videoId:  string;
  status:   VideoStatus;
  url?:     string;
  progress: number;
  error?:   string;
}

interface ImageResult {
  id:   string;
  url:  string | null;
  loading: boolean;
  error?:  string;
}

interface MediaFile {
  file:      File;
  b64:       string;
  objectUrl: string;
}

// ── Model definitions ─────────────────────────────────────────────────────────

const VIDEO_MODELS: {
  provider: ModelProvider;
  model:    string;
  label:    string;
  sublabel: string;
  badge:    string;
  color:    string;
}[] = [
  {
    provider: "runway", model: "gen4_turbo",
    label: "Runway Gen-4 Turbo", sublabel: "gen4_turbo",
    badge: "Recommended",
    color: "from-tt-accent/20 to-tt-blue/10 border-tt-accent/40 text-tt-accent",
  },
  {
    provider: "runway", model: "gen4_5",
    label: "Runway Gen-4.5", sublabel: "gen4_5",
    badge: "Custom Training",
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/40 text-purple-300",
  },
  {
    provider: "veo", model: "veo-3.1-generate-preview",
    label: "Google Veo 3.1", sublabel: "veo-3.1-preview",
    badge: "Fallback",
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/40 text-blue-300",
  },
];

const IMAGE_MODELS = [
  { value: "imagen_fast",  label: "Imagen Flash",   badge: "Fastest",  sub: "~5s per image" },
  { value: "imagen_pro",   label: "Imagen Pro",     badge: "Best Quality", sub: "~20s per image" },
];

const VEO_MODELS: { value: VeoModel; label: string; badge: string }[] = [
  { value: "veo-3.1-generate-preview", label: "Veo 3.1", badge: "Latest" },
  { value: "veo-3.0-generate-preview", label: "Veo 3.0", badge: "Stable" },
  { value: "veo-2.0-generate-001",     label: "Veo 2.0", badge: "Fast"   },
];

const ASPECT_RATIOS_VIDEO  = ["16:9", "9:16", "1:1", "4:3"] as const;
const ASPECT_RATIOS_IMAGE  = ["16:9", "9:16", "1:1", "4:3"] as const;
const RUNWAY_DURATIONS     = [5, 10] as const;
const VEO_DURATIONS        = [5, 8, 10] as const;
const IMAGE_COUNTS         = [1, 2, 3, 4] as const;

const MOTION_OPTS   = ["subtle", "medium", "dynamic", "cinematic", "epic"] as const;
const CAMERA_OPTS   = ["static", "slow_pan", "dolly_in", "dolly_out", "orbit", "handheld", "epic_tracking"] as const;
const LIGHTING_OPTS = ["golden_hour", "dramatic", "soft_natural", "studio", "neon", "moody_low_key"] as const;
const STYLE_OPTS    = ["photorealistic", "cinematic", "commercial", "artistic", "documentary", "anime"] as const;
const QUALITY_OPTS  = ["standard", "high", "ultra"] as const;
const IMG_STYLE_OPTS= ["photorealistic", "cinematic", "artistic", "commercial", "anime", "illustration", "3d_render"] as const;

function label(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function urlToBase64(url: string): Promise<string> {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0 px-6 py-4">
      {steps.map((lbl, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <motion.div
              animate={{
                backgroundColor: i < current ? "#00d4b8" : "transparent",
                borderColor:     i <= current ? "#00d4b8" : "#1e1e30",
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold"
            >
              {i < current ? (
                <Check size={12} className="text-black" />
              ) : (
                <span className={i === current ? "text-tt-accent" : "text-tt-muted"}>{i + 1}</span>
              )}
            </motion.div>
            <span className={clsx("text-[10px] font-medium whitespace-nowrap", i === current ? "text-tt-accent" : i < current ? "text-tt-text/60" : "text-tt-muted")}>
              {lbl}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={clsx("step-connector mb-5 mx-3", i < current ? "active" : "")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Chip selector ─────────────────────────────────────────────────────────────

function ChipSelector<T extends string>({
  options, value, onChange, labelFn,
}: {
  options: readonly T[];
  value:   T;
  onChange: (v: T) => void;
  labelFn?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={clsx(
            "rounded-lg px-2.5 py-1.5 text-xs font-semibold border capitalize transition-all",
            value === opt
              ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
              : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim hover:text-tt-text"
          )}
        >
          {(labelFn ?? label)(opt)}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function GenerationForm({ brands, onGenerated }: GenerationFormProps) {

  // ── Tab + brand ──────────────────────────────────────────────────────────────
  const [tabMode, setTabMode]       = useState<TabMode>("video");
  const [brand, setBrand]           = useState<Brand | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [prompt, setPrompt]         = useState("");
  const [gemini, setGemini]         = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // ── Video mode state ─────────────────────────────────────────────────────────
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("setup");

  // Model selection
  const [provider, setProvider]     = useState<ModelProvider>("runway");
  const [runwayModel, setRunwayModel] = useState<RunwayModel>("gen4_turbo");
  const [veoModel, setVeoModel]     = useState<VeoModel>("veo-3.1-generate-preview");

  // Shared params
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration]     = useState(5);
  const [motionStrength, setMotionStrength] = useState("medium");
  const [cameraMove, setCameraMove] = useState("static");
  const [lightingStyle, setLightingStyle] = useState("soft_natural");
  const [visualStyle, setVisualStyle] = useState("cinematic");
  const [quality, setQuality]       = useState("high");
  const [negativePrompt, setNegativePrompt] = useState("");

  // Reference images
  const [refImages, setRefImages]   = useState<RefImage[]>([]);
  const [selectedRef, setSelectedRef] = useState<RefImage | null>(null);
  const [uploadedRef, setUploadedRef] = useState<MediaFile | null>(null);
  const refFileRef                  = useRef<HTMLInputElement>(null);

  // Extras
  const [modelRef, setModelRef]     = useState<MediaFile | null>(null);
  const [startCard, setStartCard]   = useState<MediaFile | null>(null);
  const modelFileRef                = useRef<HTMLInputElement>(null);
  const startFileRef                = useRef<HTMLInputElement>(null);

  // Video results
  const [videos, setVideos]         = useState<VideoResult[]>([]);
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voiceover modal
  const [voiceoverOpen, setVoiceoverOpen]   = useState(false);
  const [voiceoverVideo, setVoiceoverVideo] = useState<VideoResult | null>(null);

  // ── Image mode state ─────────────────────────────────────────────────────────
  const [imagePhase, setImagePhase] = useState<ImagePhase>("setup");
  const [imageModel, setImageModel] = useState("imagen_fast");
  const [imgAspect, setImgAspect]   = useState("16:9");
  const [imgStyle, setImgStyle]     = useState("photorealistic");
  const [imgQuality, setImgQuality] = useState("high");
  const [imgCount, setImgCount]     = useState<1 | 2 | 3 | 4>(1);
  const [imgNeg, setImgNeg]         = useState("");
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── File upload helper ────────────────────────────────────────────────────────
  async function handleFileUpload(file: File, setter: (mf: MediaFile | null) => void) {
    const b64 = await fileToBase64(file);
    setter({ file, b64, objectUrl: URL.createObjectURL(file) });
  }

  // ── Build video generation request ──────────────────────────────────────────
  function buildVideoRequest(refB64: string | null): GenerateRequest {
    const base: GenerateRequest = {
      user_prompt:    prompt,
      brand_id:       brand?.id ?? null,
      mode:           "video",
      model_provider: provider,
      enhance_prompt: gemini,
    };

    if (provider === "runway") {
      base.runway_params = {
        ...DEFAULT_RUNWAY_PARAMS,
        runway_model:           runwayModel,
        duration:               duration as 5 | 10,
        aspect_ratio:           aspectRatio as RunwayParams["aspect_ratio"],
        motion_strength:        motionStrength as RunwayParams["motion_strength"],
        camera_movement:        cameraMove as RunwayParams["camera_movement"],
        lighting_style:         lightingStyle as RunwayParams["lighting_style"],
        visual_style:           visualStyle as RunwayParams["visual_style"],
        quality:                quality as RunwayParams["quality"],
        negative_prompt:        negativePrompt || null,
        conditioning_image_b64: refB64 ?? null,
        reference_images_b64:   modelRef?.b64 ? [modelRef.b64] : null,
      };
    } else if (provider === "veo") {
      base.video_params = {
        ...DEFAULT_VIDEO_PARAMS,
        veo_model:            veoModel,
        duration:             duration as VideoParams["duration"],
        aspect_ratio:         aspectRatio as VideoParams["aspect_ratio"],
        camera_movement:      cameraMove as VideoParams["camera_movement"],
        motion_strength:      motionStrength as VideoParams["motion_strength"],
        lighting_style:       lightingStyle as VideoParams["lighting_style"],
        visual_style:         visualStyle as VideoParams["visual_style"],
        quality:              quality as VideoParams["quality"],
        negative_prompt:      negativePrompt || null,
        reference_images_b64: (refB64 || modelRef?.b64)
          ? [...(refB64 ? [refB64] : []), ...(modelRef?.b64 ? [modelRef.b64] : [])]
          : null,
        start_card_b64: startCard?.b64 ?? null,
      };
    } else {
      base.kling_params = {
        ...DEFAULT_KLING_PARAMS,
        duration:               duration as KlingParams["duration"],
        aspect_ratio:           aspectRatio as KlingParams["aspect_ratio"],
        negative_prompt:        negativePrompt || null,
        conditioning_image_b64: refB64 ?? null,
        reference_image_b64:    modelRef?.b64 ?? null,
      };
    }

    return base;
  }

  // ── VIDEO: Step 1 — Generate 3 reference images ──────────────────────────────
  async function generateRefImages() {
    if (!prompt.trim()) { setError("Please enter a prompt first."); return; }
    setError(null);
    setVideoPhase("gen-ref");
    setRefImages([
      { id: "r1", url: null, b64: null, loading: true },
      { id: "r2", url: null, b64: null, loading: true },
      { id: "r3", url: null, b64: null, loading: true },
    ]);

    const imgReq: GenerateRequest = {
      user_prompt:    prompt,
      brand_id:       brand?.id ?? null,
      mode:           "image",
      enhance_prompt: gemini,
      image_params: {
        ...DEFAULT_IMAGE_PARAMS,
        aspect_ratio: aspectRatio as ImageParams["aspect_ratio"],
        number_of_images: 1,
      },
    };

    const results = await Promise.allSettled([
      generateAsset(imgReq),
      generateAsset(imgReq),
      generateAsset(imgReq),
    ]);

    // Fetch actual image URLs for completed generations
    const images: RefImage[] = await Promise.all(
      results.map(async (r, i) => {
        if (r.status === "fulfilled") {
          try {
            const vid = await import("../lib/api").then(m => m.getVideo(r.value.video_id));
            const url = vid.video_url ?? null;
            onGenerated(r.value);
            return { id: `r${i + 1}`, url, b64: null, loading: false };
          } catch {
            return { id: `r${i + 1}`, url: null, b64: null, loading: false, error: "Failed to load" };
          }
        }
        return { id: `r${i + 1}`, url: null, b64: null, loading: false, error: String((r as PromiseRejectedResult).reason) };
      })
    );

    setRefImages(images);
    setVideoPhase("pick-ref");
  }

  // ── VIDEO: Step 2 — Animate selected reference ───────────────────────────────
  async function animateReference() {
    const ref = selectedRef ?? (uploadedRef ? { id: "u", url: null, b64: uploadedRef.b64, loading: false } : null);
    if (!ref) { setError("Please select or upload a reference image first."); return; }
    setError(null);
    setVideoPhase("animating");

    let refB64: string | null = ref.b64 ?? null;
    if (!refB64 && ref.url) {
      try { refB64 = await urlToBase64(ref.url); }
      catch { setError("Could not load the reference image. Try uploading it directly."); setVideoPhase("pick-ref"); return; }
    }
    if (!refB64 && uploadedRef) refB64 = uploadedRef.b64;

    setVideos([
      { slotId: "v1", videoId: "", status: "PENDING", progress: 10 },
      { slotId: "v2", videoId: "", status: "PENDING", progress: 10 },
    ]);

    const req = buildVideoRequest(refB64);
    const results = await Promise.allSettled([
      generateAsset(req),
      generateAsset(req),
    ]);

    const newVideos: VideoResult[] = results.map((r, i) => {
      if (r.status === "fulfilled") {
        onGenerated(r.value);
        return { slotId: `v${i + 1}`, videoId: r.value.video_id, status: r.value.status as VideoStatus, progress: 15 };
      }
      return { slotId: `v${i + 1}`, videoId: "", status: "FAILED", progress: 0, error: String((r as PromiseRejectedResult).reason) };
    });
    setVideos(newVideos);
    startVideoPolling(newVideos);
  }

  function startVideoPolling(initialVideos: VideoResult[]) {
    if (pollRef.current) clearInterval(pollRef.current);
    let vids = [...initialVideos];

    pollRef.current = setInterval(async () => {
      const pending = vids.filter((v) => v.videoId && (v.status === "PENDING" || v.status === "PROCESSING"));
      if (!pending.length) { clearInterval(pollRef.current!); setVideoPhase("done"); return; }

      const updates = await Promise.allSettled(pending.map((v) => getVideo(v.videoId)));
      vids = vids.map((v) => {
        const idx = pending.findIndex((p) => p.videoId === v.videoId);
        if (idx === -1) return v;
        const res = updates[idx];
        if (res.status === "fulfilled") {
          const vid = res.value;
          return { ...v, status: vid.status, url: vid.video_url ?? undefined, progress: vid.status === "COMPLETED" ? 100 : Math.min(95, v.progress + 8) };
        }
        return { ...v, progress: Math.min(95, v.progress + 4) };
      });
      setVideos([...vids]);
      if (vids.every((v) => v.status === "COMPLETED" || v.status === "FAILED")) {
        clearInterval(pollRef.current!);
        setVideoPhase("done");
      }
    }, 6000);
  }

  function resetVideo() {
    if (pollRef.current) clearInterval(pollRef.current);
    setVideoPhase("setup");
    setRefImages([]);
    setSelectedRef(null);
    setVideos([]);
    setError(null);
  }

  // ── IMAGE: Direct generation (no phase picker) ───────────────────────────────
  async function generateImages() {
    if (!prompt.trim()) { setError("Please enter a prompt first."); return; }
    setError(null);
    setImagePhase("generating");
    setImageResults(Array.from({ length: imgCount }, (_, i) => ({ id: `img${i}`, url: null, loading: true })));

    const req: GenerateRequest = {
      user_prompt:    prompt,
      brand_id:       brand?.id ?? null,
      mode:           "image",
      enhance_prompt: gemini,
      image_params: {
        aspect_ratio:     imgAspect as ImageParams["aspect_ratio"],
        style:            imgStyle as ImageParams["style"],
        quality:          imgQuality as ImageParams["quality"],
        number_of_images: imgCount,
        negative_prompt:  imgNeg || null,
      },
    };

    try {
      const res = await generateAsset(req);
      onGenerated(res);

      // Fetch each image URL
      const ids = res.video_ids.length ? res.video_ids : [res.video_id];
      const fetched: ImageResult[] = await Promise.all(
        ids.map(async (id, i) => {
          try {
            const vid = await getVideo(id);
            return { id: `img${i}`, url: vid.video_url ?? null, loading: false };
          } catch {
            return { id: `img${i}`, url: null, loading: false, error: "Failed to load" };
          }
        })
      );
      setImageResults(fetched);
      setImagePhase("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Image generation failed.");
      setImagePhase("setup");
      setImageResults([]);
    }
  }

  function resetImage() {
    setImagePhase("setup");
    setImageResults([]);
    setError(null);
  }

  // ── Unified reset ────────────────────────────────────────────────────────────
  function reset() {
    resetVideo();
    resetImage();
  }

  // ── Step indices ─────────────────────────────────────────────────────────────
  const videoStepIdx = { setup: 0, "gen-ref": 1, "pick-ref": 1, animating: 2, done: 3 }[videoPhase];
  const imageStepIdx = { setup: 0, generating: 1, done: 2 }[imagePhase];

  const activeProvider = VIDEO_MODELS.find((m) => m.provider === provider && m.model === (provider === "runway" ? runwayModel : veoModel));

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col h-full">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b border-tt-border bg-tt-surface/80 backdrop-blur">
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <div>
              <h1 className="text-xl font-bold text-tt-text">Create with AI</h1>
              <p className="text-xs text-tt-muted mt-0.5">TikTok-style brand video pipeline</p>
            </div>
            {/* Tab switcher */}
            <div className="flex items-center gap-1 rounded-xl bg-tt-card border border-tt-border p-1">
              {(["video", "image"] as TabMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setTabMode(m); reset(); }}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                    tabMode === m ? "bg-tt-accent/15 text-tt-accent shadow-sm" : "text-tt-muted hover:text-tt-text"
                  )}
                >
                  {m === "video" ? <Film size={15} /> : <ImageIcon size={15} />}
                  {m === "video" ? "Video" : "Image"}
                </button>
              ))}
            </div>
          </div>

          {/* Step indicator */}
          <StepIndicator
            steps={tabMode === "video"
              ? ["Reference", "Animate", "Done"]
              : ["Setup", "Generate", "Done"]}
            current={tabMode === "video" ? videoStepIdx : imageStepIdx}
          />
        </div>

        {/* ── Main area ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-tt-bg px-6 py-6">

          {/* Error banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200"><X size={14} /></button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">

            {/* ═══════════════════════════════════════════════════════════════
                VIDEO MODE
               ═══════════════════════════════════════════════════════════════ */}
            {tabMode === "video" && (

              <>
                {/* ── VIDEO SETUP ────────────────────────────────────────── */}
                {videoPhase === "setup" && (
                  <motion.div
                    key="video-setup"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    {/* Brand */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Brand</label>
                      <select
                        value={brand?.id ?? ""}
                        onChange={(e) => setBrand(brands.find((b) => b.id === e.target.value) ?? null)}
                        className="w-full rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text focus:border-tt-accent/50 focus:outline-none transition-all"
                      >
                        <option value="">No brand</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>

                    {/* Model selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">AI Model</label>
                      <div className="grid grid-cols-3 gap-2">
                        {VIDEO_MODELS.map((m) => {
                          const isActive = provider === m.provider &&
                            (m.provider === "runway" ? runwayModel === m.model : m.provider === "veo" ? veoModel === m.model : true);
                          return (
                            <button
                              key={`${m.provider}-${m.model}`}
                              onClick={() => {
                                setProvider(m.provider);
                                if (m.provider === "runway") setRunwayModel(m.model as RunwayModel);
                                if (m.provider === "veo")    setVeoModel(m.model as VeoModel);
                                // Adjust duration for Runway (no 8s)
                                if (m.provider === "runway" && duration === 8) setDuration(5);
                              }}
                              className={clsx(
                                "rounded-xl border p-3 text-left transition-all text-xs",
                                isActive
                                  ? `bg-gradient-to-br ${m.color}`
                                  : "border-tt-border bg-tt-card text-tt-muted hover:border-tt-dim hover:text-tt-text"
                              )}
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <p className={clsx("font-bold leading-tight text-[11px]", isActive ? "" : "text-tt-text")}>{m.label}</p>
                                <span className={clsx("flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold border",
                                  isActive ? "border-current bg-current/10" : "border-tt-border bg-tt-surface text-tt-muted"
                                )}>
                                  {m.badge}
                                </span>
                              </div>
                              <p className="text-[10px] opacity-60 font-mono">{m.sublabel}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Prompt</label>
                        <button
                          onClick={() => setGemini((g) => !g)}
                          className={clsx(
                            "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                            gemini ? "bg-tt-accent/15 text-tt-accent" : "bg-tt-border text-tt-muted hover:text-tt-text"
                          )}
                        >
                          <Sparkles size={11} />
                          Gemini Enhance {gemini ? "ON" : "OFF"}
                        </button>
                      </div>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe your video scene — a person holding a product, walking in a city, dancing…"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-tt-border bg-tt-card px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                      />
                    </div>

                    {/* Reference image upload */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Reference Image</p>
                      <input ref={refFileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setUploadedRef)} />
                      {uploadedRef ? (
                        <div className="relative h-36 w-full overflow-hidden rounded-xl border border-tt-accent/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={uploadedRef.objectUrl} alt="Reference" className="h-full w-full object-cover" />
                          <button onClick={() => setUploadedRef(null)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><X size={12} /></button>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <p className="text-xs font-semibold text-white">Reference uploaded · will skip image generation</p>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => refFileRef.current?.click()}
                          className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-tt-border bg-tt-card/50 py-7 text-tt-muted hover:border-tt-accent/40 hover:bg-tt-card hover:text-tt-text transition-all">
                          <Upload size={22} />
                          <div className="text-center">
                            <p className="text-sm font-medium">Upload reference image</p>
                            <p className="text-xs text-tt-muted">or generate 3 AI options below</p>
                          </div>
                        </button>
                      )}

                      {/* Optional extras */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Model Reference",  ref: modelFileRef, state: modelRef, setter: setModelRef },
                          { label: "Start Card",        ref: startFileRef, state: startCard, setter: setStartCard },
                        ].map(({ label: lbl, ref: inputRef, state, setter }) => (
                          <div key={lbl}>
                            <input ref={inputRef} type="file" accept="image/*" className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setter)} />
                            {state ? (
                              <div className="relative h-20 overflow-hidden rounded-xl border border-tt-border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={state.objectUrl} alt={lbl} className="h-full w-full object-cover" />
                                <button onClick={() => setter(null)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><X size={10} /></button>
                              </div>
                            ) : (
                              <button onClick={() => inputRef.current?.click()}
                                className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-tt-border bg-tt-card/30 text-tt-muted hover:border-tt-dim hover:text-tt-text transition-all">
                                <Upload size={15} />
                                <span className="text-[10px] text-center leading-tight px-2">{lbl} (optional)</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Advanced settings */}
                    <div className="rounded-xl border border-tt-border bg-tt-card">
                      <button
                        onClick={() => setShowSettings((s) => !s)}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-tt-text"
                      >
                        <div className="flex items-center gap-2">
                          <Settings2 size={15} className="text-tt-muted" />
                          <span>Advanced Parameters</span>
                          {activeProvider && (
                            <span className="rounded-full border border-tt-accent/30 bg-tt-accent/10 px-2 py-0.5 text-[10px] font-bold text-tt-accent">
                              {activeProvider.label}
                            </span>
                          )}
                        </div>
                        <ChevronDown size={16} className={clsx("text-tt-muted transition-transform", showSettings ? "rotate-180" : "")} />
                      </button>

                      <AnimatePresence>
                        {showSettings && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-tt-border px-4 pb-4 pt-3 space-y-4">

                              {/* Veo sub-model picker (only shown when veo selected) */}
                              {provider === "veo" && (
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Veo Model Version</label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {VEO_MODELS.map((m) => (
                                      <button key={m.value} onClick={() => setVeoModel(m.value)}
                                        className={clsx("rounded-lg border px-2 py-2 text-left text-xs transition-all",
                                          veoModel === m.value ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent" : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim")}>
                                        <p className="font-semibold">{m.label}</p>
                                        <p className="text-[10px] opacity-70">{m.badge}</p>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Aspect ratio */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Aspect Ratio</label>
                                <ChipSelector options={ASPECT_RATIOS_VIDEO} value={aspectRatio as typeof ASPECT_RATIOS_VIDEO[number]} onChange={setAspectRatio} />
                              </div>

                              {/* Duration */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Duration</label>
                                <div className="flex gap-1.5">
                                  {(provider === "veo" ? VEO_DURATIONS : RUNWAY_DURATIONS).map((d) => (
                                    <button key={d} onClick={() => setDuration(d)}
                                      className={clsx("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                                        duration === d ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent" : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim")}>
                                      {d}s
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Motion + Camera (2-col) */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Motion</label>
                                  <ChipSelector options={MOTION_OPTS} value={motionStrength as typeof MOTION_OPTS[number]} onChange={setMotionStrength} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Camera</label>
                                  <ChipSelector options={CAMERA_OPTS} value={cameraMove as typeof CAMERA_OPTS[number]} onChange={setCameraMove} />
                                </div>
                              </div>

                              {/* Lighting + Style (2-col) */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Lighting</label>
                                  <ChipSelector options={LIGHTING_OPTS} value={lightingStyle as typeof LIGHTING_OPTS[number]} onChange={setLightingStyle} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Visual Style</label>
                                  <ChipSelector options={STYLE_OPTS} value={visualStyle as typeof STYLE_OPTS[number]} onChange={setVisualStyle} />
                                </div>
                              </div>

                              {/* Quality */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Quality</label>
                                <ChipSelector options={QUALITY_OPTS} value={quality as typeof QUALITY_OPTS[number]} onChange={setQuality} />
                              </div>

                              {/* Negative prompt */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Negative Prompt</label>
                                <input
                                  value={negativePrompt}
                                  onChange={(e) => setNegativePrompt(e.target.value)}
                                  placeholder="blur, low quality, watermark, text…"
                                  className="w-full rounded-xl border border-tt-border bg-tt-surface px-3 py-2 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none transition-all"
                                />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* CTA */}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={uploadedRef ? animateReference : generateRefImages}
                      disabled={!prompt.trim()}
                      className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Wand2 size={18} />
                      {uploadedRef ? "Generate 2 Videos →" : "Generate 3 Reference Images →"}
                    </motion.button>
                  </motion.div>
                )}

                {/* ── VIDEO: gen-ref ──────────────────────────────────────── */}
                {videoPhase === "gen-ref" && (
                  <motion.div
                    key="video-gen-ref"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-tt-accent border-t-transparent" />
                      <p className="text-sm font-semibold text-tt-text">Generating reference images…</p>
                      <span className="text-xs text-tt-muted">30–60s</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[0, 1, 2].map((i) => (
                        <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                          className="aspect-video skeleton rounded-xl" />
                      ))}
                    </div>
                    <p className="text-center text-xs text-tt-muted">Prompt: <span className="text-tt-text">{prompt}</span></p>
                  </motion.div>
                )}

                {/* ── VIDEO: pick-ref ─────────────────────────────────────── */}
                {videoPhase === "pick-ref" && (
                  <motion.div
                    key="video-pick-ref"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-tt-text">Choose Your Reference</h2>
                        <p className="text-xs text-tt-muted">Select one to animate with {activeProvider?.label ?? provider}</p>
                      </div>
                      <button onClick={resetVideo} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-tt-muted hover:text-tt-text hover:bg-tt-card border border-tt-border transition-all">
                        <RotateCcw size={13} /> Start over
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {refImages.map((img, i) => (
                        <motion.div key={img.id}
                          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                          onClick={() => !img.loading && !img.error && setSelectedRef(img)}
                          className={clsx("group relative aspect-video cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-200",
                            selectedRef?.id === img.id ? "border-tt-accent shadow-glow-accent" : "border-tt-border hover:border-tt-accent/60")}>
                          {img.loading ? <div className="skeleton h-full w-full" /> :
                           img.error ? (
                             <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-950/30 text-red-400">
                               <AlertCircle size={20} /><span className="text-[10px]">Failed</span>
                             </div>
                           ) : img.url ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                              <div className="image-card-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end pb-3">
                                {selectedRef?.id === img.id ? (
                                  <span className="flex items-center gap-1 rounded-full bg-tt-accent px-3 py-1.5 text-xs font-bold text-black"><Check size={12} /> Selected</span>
                                ) : (
                                  <span className="rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs font-semibold text-white">Select</span>
                                )}
                              </div>
                              {selectedRef?.id === img.id && (
                                <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-tt-accent"><Check size={12} className="text-black" /></div>
                              )}
                            </>
                           ) : (
                             <div className="flex h-full w-full items-center justify-center bg-tt-card text-tt-muted"><ImageIcon size={24} /></div>
                           )}
                        </motion.div>
                      ))}
                    </div>

                    <button onClick={generateRefImages} className="flex items-center gap-2 text-xs text-tt-muted hover:text-tt-text transition-colors">
                      <RotateCcw size={13} /> Regenerate options
                    </button>

                    <motion.button whileTap={{ scale: 0.97 }} onClick={animateReference}
                      disabled={!selectedRef && !uploadedRef}
                      className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold disabled:opacity-40">
                      <Film size={18} />
                      Animate → Generate 2 Videos
                    </motion.button>
                  </motion.div>
                )}

                {/* ── VIDEO: animating ────────────────────────────────────── */}
                {videoPhase === "animating" && (
                  <motion.div
                    key="video-animating"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    <div>
                      <h2 className="text-base font-bold text-tt-text">Generating your videos…</h2>
                      <p className="text-xs text-tt-muted mt-1">This may take 1–3 minutes. You can leave this tab open.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {videos.map((v, i) => (
                        <motion.div key={v.slotId} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.12 }}
                          className="overflow-hidden rounded-xl border border-tt-border bg-tt-card">
                          <div className="aspect-video flex flex-col items-center justify-center gap-4 bg-tt-surface">
                            {v.status === "FAILED" ? (
                              <div className="flex flex-col items-center gap-2 text-red-400"><AlertCircle size={24} /><p className="text-xs text-center">{v.error ?? "Generation failed"}</p></div>
                            ) : (
                              <>
                                <CircularProgress value={v.progress} size={72} />
                                <div className="text-center">
                                  <p className="text-xs font-semibold text-tt-text">Video {i + 1}</p>
                                  <p className="text-[11px] text-tt-muted capitalize">{v.status.toLowerCase()}…</p>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="px-4 py-3 flex items-center gap-2">
                            {v.status !== "FAILED" && <Loader2 size={14} className="animate-spin text-tt-accent" />}
                            <p className="text-xs text-tt-muted">{v.status === "FAILED" ? "Failed" : `~${Math.round((100 - v.progress) / 10)} min remaining`}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {(selectedRef?.url || uploadedRef) && (
                      <div className="flex items-center gap-3 rounded-xl border border-tt-border bg-tt-card p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selectedRef?.url ?? uploadedRef!.objectUrl} alt="Reference" className="h-14 w-24 rounded-lg object-cover border border-tt-border" />
                        <div>
                          <p className="text-xs font-semibold text-tt-accent">Approved Reference</p>
                          <p className="text-[11px] text-tt-muted mt-0.5">Animating with {activeProvider?.label ?? provider}</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── VIDEO: done ─────────────────────────────────────────── */}
                {videoPhase === "done" && (
                  <motion.div
                    key="video-done"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-tt-text">Your Videos Are Ready!</h2>
                        <p className="text-xs text-tt-muted mt-1">Hover to add voiceover or download</p>
                      </div>
                      <button onClick={resetVideo} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-tt-muted hover:text-tt-text hover:bg-tt-card border border-tt-border transition-all">
                        <RotateCcw size={13} /> New creation
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {videos.map((v, i) => (
                        <VideoResultCard key={v.slotId} video={v} index={i}
                          onVoiceover={() => { setVoiceoverVideo(v); setVoiceoverOpen(true); }} />
                      ))}
                    </div>
                    {(selectedRef?.url || uploadedRef) && (
                      <div className="flex items-center gap-3 rounded-xl border border-tt-accent/20 bg-tt-accent/5 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selectedRef?.url ?? uploadedRef!.objectUrl} alt="Reference" className="h-14 w-24 rounded-lg object-cover border border-tt-border" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-tt-accent">Reference Used</p>
                          <p className="text-[11px] text-tt-muted mt-0.5 line-clamp-2">{prompt}</p>
                        </div>
                        <button onClick={resetVideo} className="btn-accent flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold">
                          <Wand2 size={13} /> New
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                IMAGE MODE
               ═══════════════════════════════════════════════════════════════ */}
            {tabMode === "image" && (

              <>
                {/* ── IMAGE SETUP ────────────────────────────────────────── */}
                {imagePhase === "setup" && (
                  <motion.div
                    key="image-setup"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    {/* Brand */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Brand</label>
                      <select
                        value={brand?.id ?? ""}
                        onChange={(e) => setBrand(brands.find((b) => b.id === e.target.value) ?? null)}
                        className="w-full rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text focus:border-tt-accent/50 focus:outline-none transition-all"
                      >
                        <option value="">No brand</option>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>

                    {/* Image model */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Image Model</label>
                      <div className="grid grid-cols-2 gap-2">
                        {IMAGE_MODELS.map((m) => (
                          <button
                            key={m.value}
                            onClick={() => setImageModel(m.value)}
                            className={clsx(
                              "rounded-xl border p-3 text-left transition-all",
                              imageModel === m.value
                                ? "border-tt-accent/50 bg-gradient-to-br from-tt-accent/15 to-tt-blue/10"
                                : "border-tt-border bg-tt-card hover:border-tt-dim"
                            )}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <p className={clsx("text-xs font-bold", imageModel === m.value ? "text-tt-accent" : "text-tt-text")}>{m.label}</p>
                              <span className={clsx("text-[9px] font-bold rounded-full px-1.5 py-0.5 border",
                                imageModel === m.value ? "border-tt-accent/30 bg-tt-accent/10 text-tt-accent" : "border-tt-border text-tt-muted"
                              )}>{m.badge}</span>
                            </div>
                            <p className="text-[11px] text-tt-muted">{m.sub}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Prompt</label>
                        <button onClick={() => setGemini((g) => !g)}
                          className={clsx("flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                            gemini ? "bg-tt-accent/15 text-tt-accent" : "bg-tt-border text-tt-muted hover:text-tt-text")}>
                          <Sparkles size={11} />Gemini Enhance {gemini ? "ON" : "OFF"}
                        </button>
                      </div>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the image — product on marble counter, model in golden light, flat lay with flowers…"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-tt-border bg-tt-card px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                      />
                    </div>

                    {/* Image parameters */}
                    <div className="rounded-xl border border-tt-border bg-tt-card">
                      <button onClick={() => setShowSettings((s) => !s)}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-tt-text">
                        <div className="flex items-center gap-2"><Camera size={15} className="text-tt-muted" />Image Parameters</div>
                        <ChevronDown size={16} className={clsx("text-tt-muted transition-transform", showSettings ? "rotate-180" : "")} />
                      </button>
                      <AnimatePresence>
                        {showSettings && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="border-t border-tt-border px-4 pb-4 pt-3 space-y-4">

                              {/* Aspect + Count */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Aspect Ratio</label>
                                  <ChipSelector options={ASPECT_RATIOS_IMAGE} value={imgAspect as typeof ASPECT_RATIOS_IMAGE[number]} onChange={setImgAspect} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Count</label>
                                  <div className="flex gap-1.5">
                                    {IMAGE_COUNTS.map((n) => (
                                      <button key={n} onClick={() => setImgCount(n)}
                                        className={clsx("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                                          imgCount === n ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent" : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim")}>
                                        {n}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Style */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Style</label>
                                <ChipSelector options={IMG_STYLE_OPTS} value={imgStyle as typeof IMG_STYLE_OPTS[number]} onChange={setImgStyle} />
                              </div>

                              {/* Quality */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Quality</label>
                                <ChipSelector options={QUALITY_OPTS} value={imgQuality as typeof QUALITY_OPTS[number]} onChange={setImgQuality} />
                              </div>

                              {/* Negative */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Negative Prompt</label>
                                <input value={imgNeg} onChange={(e) => setImgNeg(e.target.value)}
                                  placeholder="blur, watermark, text, low quality…"
                                  className="w-full rounded-xl border border-tt-border bg-tt-surface px-3 py-2 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none transition-all" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* CTA */}
                    <motion.button whileTap={{ scale: 0.97 }} onClick={generateImages} disabled={!prompt.trim()}
                      className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                      <Zap size={18} />
                      Generate {imgCount} Image{imgCount !== 1 ? "s" : ""}
                    </motion.button>
                  </motion.div>
                )}

                {/* ── IMAGE: generating ───────────────────────────────────── */}
                {imagePhase === "generating" && (
                  <motion.div
                    key="image-generating"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-tt-accent border-t-transparent" />
                      <p className="text-sm font-semibold text-tt-text">Generating {imgCount} image{imgCount !== 1 ? "s" : ""}…</p>
                    </div>
                    <div className={clsx("grid gap-3", imgCount === 1 ? "grid-cols-1" : imgCount === 2 ? "grid-cols-2" : "grid-cols-2")}>
                      {imageResults.map((_, i) => (
                        <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.08 }}
                          className="aspect-video skeleton rounded-xl" />
                      ))}
                    </div>
                    <p className="text-center text-xs text-tt-muted">Prompt: <span className="text-tt-text line-clamp-1">{prompt}</span></p>
                  </motion.div>
                )}

                {/* ── IMAGE: done ─────────────────────────────────────────── */}
                {imagePhase === "done" && (
                  <motion.div
                    key="image-done"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                    className="space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-tt-text">
                          {imageResults.length} Image{imageResults.length !== 1 ? "s" : ""} Ready!
                        </h2>
                        <p className="text-xs text-tt-muted mt-0.5">Hover to download</p>
                      </div>
                      <button onClick={resetImage} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-tt-muted hover:text-tt-text hover:bg-tt-card border border-tt-border transition-all">
                        <RotateCcw size={13} /> New images
                      </button>
                    </div>

                    <div className={clsx("grid gap-4", imageResults.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                      {imageResults.map((img, i) => (
                        <motion.div key={img.id}
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                          className="group relative overflow-hidden rounded-xl border border-tt-border bg-tt-card hover:border-tt-accent/40 hover:shadow-card-hover transition-all duration-300"
                        >
                          <div className="aspect-video relative">
                            {img.loading ? (
                              <div className="skeleton h-full w-full" />
                            ) : img.error ? (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-red-400">
                                <AlertCircle size={20} /><p className="text-xs">{img.error}</p>
                              </div>
                            ) : img.url ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.url} alt={`Generated image ${i + 1}`} className="h-full w-full object-cover" />
                                {/* Hover download overlay */}
                                <div className="absolute inset-0 image-card-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-end p-3">
                                  <a href={img.url} download={`image-${i + 1}.jpg`}
                                    className="flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-sm border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-black/80 transition-all">
                                    <Download size={13} /> Download
                                  </a>
                                </div>
                              </>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-tt-card text-tt-muted"><ImageIcon size={28} /></div>
                            )}
                          </div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-tt-accent">
                              <Check size={12} /> Image {i + 1}
                            </span>
                            {img.url && (
                              <a href={img.url} download className="flex items-center gap-1 text-[11px] text-tt-muted hover:text-tt-text transition-colors">
                                <Download size={13} /> Download
                              </a>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <button onClick={resetImage} className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold">
                      <Wand2 size={16} /> Generate More Images
                    </button>
                  </motion.div>
                )}
              </>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Voiceover modal */}
      <VoiceoverModal open={voiceoverOpen} onClose={() => setVoiceoverOpen(false)} videoUrl={voiceoverVideo?.url} />
    </>
  );
}

// ── VideoResultCard sub-component ─────────────────────────────────────────────

function VideoResultCard({ video, index, onVoiceover }: { video: VideoResult; index: number; onVoiceover: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.1 }}
      onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
      className="group overflow-hidden rounded-xl border border-tt-border bg-tt-card transition-all duration-300 hover:border-tt-accent/40 hover:shadow-card-hover"
    >
      <div className="relative aspect-video bg-tt-surface">
        {video.status === "COMPLETED" && video.url ? (
          playing ? (
            <video src={video.url} autoPlay controls className="h-full w-full object-cover" onEnded={() => setPlaying(false)} />
          ) : (
            <div className="relative h-full w-full">
              <div className="h-full w-full bg-gradient-to-br from-tt-surface to-tt-card" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <button onClick={() => setPlaying(true)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all hover:scale-110">
                  <Play size={22} className="ml-1 text-white" />
                </button>
                <p className="text-xs font-semibold text-tt-accent">Video {index + 1} Ready</p>
              </div>
              <AnimatePresence>
                {hovered && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 image-card-overlay flex flex-col items-center justify-end pb-4 gap-2">
                    <motion.button initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
                      onClick={onVoiceover}
                      className="flex items-center gap-2 rounded-full bg-tt-accent px-4 py-2 text-xs font-bold text-black hover:shadow-glow-accent transition-all">
                      <Mic size={13} /> Add Voiceover
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        ) : video.status === "FAILED" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-red-400">
            <AlertCircle size={24} /><p className="text-xs">{video.error ?? "Generation failed"}</p>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <CircularProgress value={video.progress} size={60} />
            <p className="text-xs text-tt-muted capitalize">{video.status.toLowerCase()}…</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {video.status === "COMPLETED" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-tt-accent"><Check size={12} /> Ready</span>
          ) : video.status === "FAILED" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400"><AlertCircle size={12} /> Failed</span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-tt-muted"><Clock size={12} /> Processing</span>
          )}
        </div>
        {video.status === "COMPLETED" && video.url && (
          <a href={video.url} download className="flex items-center gap-1 text-[11px] text-tt-muted hover:text-tt-text transition-colors">
            <Download size={13} /> Download
          </a>
        )}
      </div>
    </motion.div>
  );
}
