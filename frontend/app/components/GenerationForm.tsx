"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ImageIcon, Film, Upload, X, Play, Check,
  Wand2, ChevronDown, Camera, Zap, RotateCcw,
  Mic, Download, AlertCircle, Clock, Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import {
  Brand, GenerateResponse, GenerateRequest,
  VideoParams, ImageParams, KlingParams, ModelProvider,
  DEFAULT_VIDEO_PARAMS, DEFAULT_IMAGE_PARAMS, DEFAULT_KLING_PARAMS,
  VeoModel, generateAsset, fileToBase64, getVideo, VideoStatus,
} from "../lib/api";
import { CircularProgress } from "./CircularProgress";
import { VoiceoverModal } from "./VoiceoverModal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenerationFormProps {
  brands:      Brand[];
  onGenerated: (response: GenerateResponse) => void;
}

type TabMode = "video" | "image";

type Phase =
  | "setup"         // initial: prompt + settings
  | "gen-ref"       // generating 3 reference images
  | "pick-ref"      // user selects one image
  | "animating"     // generating 2 videos
  | "done";         // videos ready

interface RefImage {
  id:       string;
  url:      string | null;
  b64:      string | null;
  loading:  boolean;
  error?:   string;
}

interface VideoResult {
  slotId:    string;
  videoId:   string;
  status:    VideoStatus;
  url?:      string;
  progress:  number;
  error?:    string;
}

interface MediaFile {
  file:      File;
  b64:       string;
  objectUrl: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VEO_MODELS: { value: VeoModel; label: string; badge: string }[] = [
  { value: "veo-3.1-generate-preview", label: "Veo 3.1 Preview", badge: "Latest" },
  { value: "veo-3.0-generate-preview", label: "Veo 3.0 Preview", badge: "Higher Quality" },
  { value: "veo-2.0-generate-001",     label: "Veo 2.0",         badge: "Fast" },
];

const KLING_MODELS = [
  { value: "kling-3.0", label: "Kling 3.0", badge: "Latest" },
  { value: "kling-2.1", label: "Kling 2.1", badge: "Stable" },
  { value: "kling-1.5", label: "Kling 1.5", badge: "Fast"   },
];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;
const DURATIONS     = [5, 8, 10] as const;

const CAMERA_MOVES = [
  "static", "slow_pan", "dolly_in", "dolly_out", "orbit", "handheld", "epic_tracking",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      {steps.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <motion.div
              animate={{
                backgroundColor: i < current ? "#00d4b8" : i === current ? "transparent" : "transparent",
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
              {label}
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

// ── Main Component ─────────────────────────────────────────────────────────────

export function GenerationForm({ brands, onGenerated }: GenerationFormProps) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [tabMode, setTabMode]       = useState<TabMode>("video");
  const [phase, setPhase]           = useState<Phase>("setup");
  const [error, setError]           = useState<string | null>(null);

  // Settings
  const [brand, setBrand]           = useState<Brand | null>(null);
  const [prompt, setPrompt]         = useState("");
  const [provider, setProvider]     = useState<ModelProvider>("veo");
  const [veoModel, setVeoModel]     = useState<VeoModel>("veo-3.1-generate-preview");
  const [klingModel, setKlingModel] = useState("kling-3.0");
  const [gemini, setGemini]         = useState(true);
  const [aspectRatio, setAspectRatio] = useState<string>("16:9");
  const [duration, setDuration]     = useState(8);
  const [cameraMove, setCameraMove] = useState("static");
  const [showSettings, setShowSettings] = useState(false);

  // Reference images (generated or uploaded)
  const [refImages, setRefImages]   = useState<RefImage[]>([]);
  const [selectedRef, setSelectedRef] = useState<RefImage | null>(null);
  const [uploadedRef, setUploadedRef] = useState<MediaFile | null>(null);
  const refFileRef                  = useRef<HTMLInputElement>(null);

  // Optional extras
  const [modelRef, setModelRef]     = useState<MediaFile | null>(null);
  const [startCard, setStartCard]   = useState<MediaFile | null>(null);
  const modelFileRef                = useRef<HTMLInputElement>(null);
  const startFileRef                = useRef<HTMLInputElement>(null);

  // Video results
  const [videos, setVideos]         = useState<VideoResult[]>([]);
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null);

  // Voiceover modal
  const [voiceoverOpen, setVoiceoverOpen] = useState(false);
  const [voiceoverVideo, setVoiceoverVideo] = useState<VideoResult | null>(null);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Upload handler helper ────────────────────────────────────────────────────
  async function handleFileUpload(
    file: File,
    setter: (mf: MediaFile | null) => void
  ) {
    const b64 = await fileToBase64(file);
    setter({ file, b64, objectUrl: URL.createObjectURL(file) });
  }

  // ── Step 1: Generate 3 reference images ─────────────────────────────────────
  async function generateRefImages() {
    if (!prompt.trim()) { setError("Please enter a prompt first."); return; }
    setError(null);
    setPhase("gen-ref");

    // Placeholder loading states
    setRefImages([
      { id: "r1", url: null, b64: null, loading: true },
      { id: "r2", url: null, b64: null, loading: true },
      { id: "r3", url: null, b64: null, loading: true },
    ]);

    const req: GenerateRequest = {
      prompt,
      brand_id:           brand?.id,
      mode:               "image",
      use_gemini_enhance: gemini,
      image_params: {
        ...DEFAULT_IMAGE_PARAMS,
        aspect_ratio: aspectRatio as ImageParams["aspect_ratio"],
      },
      reference_images_b64: uploadedRef ? [uploadedRef.b64] : undefined,
      model_reference_image_b64: modelRef?.b64,
    };

    // Fire 3 parallel image generations
    const results = await Promise.allSettled([
      generateAsset(req),
      generateAsset(req),
      generateAsset(req),
    ]);

    const images: RefImage[] = results.map((r, i) => {
      if (r.status === "fulfilled") {
        const url = r.value.image_url ?? r.value.image_urls?.[0] ?? null;
        return { id: `r${i + 1}`, url, b64: null, loading: false };
      }
      return { id: `r${i + 1}`, url: null, b64: null, loading: false, error: String((r as PromiseRejectedResult).reason) };
    });

    setRefImages(images);
    setPhase("pick-ref");

    // Notify parent of image generation
    results.forEach((r) => {
      if (r.status === "fulfilled") onGenerated(r.value);
    });
  }

  // ── Step 2: Animate selected reference into 2 videos ────────────────────────
  async function animateReference() {
    const ref = selectedRef ?? (uploadedRef ? { id: "u", url: null, b64: uploadedRef.b64, loading: false } : null);
    if (!ref && !uploadedRef) { setError("Please select a reference image first."); return; }
    setError(null);
    setPhase("animating");

    // Convert URL → b64 if needed
    let refB64: string | null = ref?.b64 ?? null;
    if (!refB64 && ref?.url) {
      try { refB64 = await urlToBase64(ref.url); }
      catch { setError("Could not load the reference image. Try uploading it directly."); setPhase("pick-ref"); return; }
    }
    if (!refB64 && uploadedRef) refB64 = uploadedRef.b64;

    // Init 2 video slots
    setVideos([
      { slotId: "v1", videoId: "", status: "PENDING", progress: 10 },
      { slotId: "v2", videoId: "", status: "PENDING", progress: 10 },
    ]);

    const baseReq: GenerateRequest = {
      prompt,
      brand_id:           brand?.id,
      mode:               "video",
      provider,
      use_gemini_enhance: gemini,
      reference_images_b64: refB64 ? [refB64] : undefined,
      model_reference_image_b64: modelRef?.b64,
      start_card_b64:            startCard?.b64,
      ...(provider === "veo"
        ? {
            video_params: {
              ...DEFAULT_VIDEO_PARAMS,
              model:         veoModel,
              aspect_ratio:  aspectRatio as VideoParams["aspect_ratio"],
              duration_seconds: duration,
              camera_movement: cameraMove as VideoParams["camera_movement"],
            },
          }
        : {
            kling_params: {
              ...DEFAULT_KLING_PARAMS,
              model:        klingModel,
              aspect_ratio: aspectRatio as KlingParams["aspect_ratio"],
              duration:     duration,
            },
          }),
    };

    // Generate 2 videos in parallel
    const results = await Promise.allSettled([
      generateAsset(baseReq),
      generateAsset(baseReq),
    ]);

    const newVideos: VideoResult[] = results.map((r, i) => {
      if (r.status === "fulfilled") {
        onGenerated(r.value);
        return { slotId: `v${i + 1}`, videoId: r.value.video_id, status: r.value.status as VideoStatus, progress: 15 };
      }
      return { slotId: `v${i + 1}`, videoId: "", status: "FAILED", progress: 0, error: String((r as PromiseRejectedResult).reason) };
    });
    setVideos(newVideos);

    // Poll for completion
    startPolling(newVideos);
  }

  function startPolling(initialVideos: VideoResult[]) {
    if (pollRef.current) clearInterval(pollRef.current);
    let vids = [...initialVideos];

    pollRef.current = setInterval(async () => {
      const pending = vids.filter((v) => v.videoId && (v.status === "PENDING" || v.status === "PROCESSING"));
      if (!pending.length) {
        clearInterval(pollRef.current!);
        setPhase("done");
        return;
      }

      const updates = await Promise.allSettled(pending.map((v) => getVideo(v.videoId)));

      vids = vids.map((v) => {
        const idx = pending.findIndex((p) => p.videoId === v.videoId);
        if (idx === -1) return v;
        const res = updates[idx];
        if (res.status === "fulfilled") {
          const vid = res.value;
          return {
            ...v,
            status:   vid.status,
            url:      vid.video_url,
            progress: vid.status === "COMPLETED" ? 100 : Math.min(95, v.progress + 8),
          };
        }
        return { ...v, progress: Math.min(95, v.progress + 4) };
      });

      setVideos([...vids]);

      // Check if all done
      const allDone = vids.every((v) => v.status === "COMPLETED" || v.status === "FAILED");
      if (allDone) {
        clearInterval(pollRef.current!);
        setPhase("done");
      }
    }, 6000);
  }

  function reset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase("setup");
    setRefImages([]);
    setSelectedRef(null);
    setVideos([]);
    setError(null);
  }

  // ── Step index for indicator ─────────────────────────────────────────────────
  const stepIndex = { setup: 0, "gen-ref": 1, "pick-ref": 1, animating: 2, done: 3 }[phase];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col h-full">

        {/* ── Top header bar ──────────────────────────────────────────────── */}
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
                    tabMode === m
                      ? "bg-tt-accent/15 text-tt-accent shadow-sm"
                      : "text-tt-muted hover:text-tt-text"
                  )}
                >
                  {m === "video" ? <Film size={15} /> : <ImageIcon size={15} />}
                  {m === "video" ? "Generate Video" : "Generate Image"}
                </button>
              ))}
            </div>
          </div>

          {/* Step indicator */}
          <StepIndicator
            steps={tabMode === "video" ? ["Reference Image", "Animate", "Voiceover"] : ["Setup", "Generate", "Done"]}
            current={stepIndex}
          />
        </div>

        {/* ── Main pipeline area ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-tt-bg px-6 py-6">

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
                <X size={14} />
              </button>
            </motion.div>
          )}

          <AnimatePresence mode="wait">

            {/* ── PHASE: setup ─────────────────────────────────────────────── */}
            {phase === "setup" && (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-5"
              >
                {/* Brand + Provider row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Brand</label>
                    <select
                      value={brand?.id ?? ""}
                      onChange={(e) => setBrand(brands.find((b) => b.id === e.target.value) ?? null)}
                      className="w-full rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                    >
                      <option value="">No brand</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">AI Provider</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "veo",  label: "Google Veo", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-300" },
                        { value: "kling",label: "Kling AI",   color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-300" },
                      ].map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setProvider(p.value as ModelProvider)}
                          className={clsx(
                            "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                            provider === p.value
                              ? `bg-gradient-to-br ${p.color}`
                              : "border-tt-border bg-tt-card text-tt-muted hover:border-tt-dim"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
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
                        gemini
                          ? "bg-tt-accent/15 text-tt-accent"
                          : "bg-tt-border text-tt-muted hover:text-tt-text"
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
                    rows={4}
                    className="w-full resize-none rounded-xl border border-tt-border bg-tt-card px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                  />
                </div>

                {/* Reference Image section */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-tt-muted">Step 1 — Reference Image</p>

                  {/* Upload reference */}
                  <input
                    ref={refFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setUploadedRef)}
                  />

                  {uploadedRef ? (
                    <div className="relative h-40 w-full overflow-hidden rounded-xl border border-tt-accent/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uploadedRef.objectUrl} alt="Reference" className="h-full w-full object-cover" />
                      <button
                        onClick={() => setUploadedRef(null)}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X size={12} />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 image-card-overlay p-3">
                        <p className="text-xs font-semibold text-white">Reference uploaded</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => refFileRef.current?.click()}
                      className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-tt-border bg-tt-card/50 py-8 text-tt-muted hover:border-tt-accent/40 hover:bg-tt-card hover:text-tt-text transition-all"
                    >
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
                      { label: "Model Reference (optional)", ref: modelFileRef, state: modelRef, setter: setModelRef },
                      { label: "Start Card (optional)",      ref: startFileRef, state: startCard, setter: setStartCard },
                    ].map(({ label, ref: inputRef, state, setter }) => (
                      <div key={label}>
                        <input
                          ref={inputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], setter)}
                        />
                        {state ? (
                          <div className="relative h-20 overflow-hidden rounded-xl border border-tt-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={state.objectUrl} alt={label} className="h-full w-full object-cover" />
                            <button
                              onClick={() => setter(null)}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => inputRef.current?.click()}
                            className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-tt-border bg-tt-card/30 text-tt-muted hover:border-tt-dim hover:text-tt-text transition-all"
                          >
                            <Upload size={16} />
                            <span className="text-[11px] text-center leading-tight px-2">{label}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Advanced settings collapse */}
                <div className="rounded-xl border border-tt-border bg-tt-card">
                  <button
                    onClick={() => setShowSettings((s) => !s)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-tt-text"
                  >
                    <div className="flex items-center gap-2">
                      <Camera size={15} className="text-tt-muted" />
                      Advanced Settings
                    </div>
                    <ChevronDown
                      size={16}
                      className={clsx("text-tt-muted transition-transform", showSettings ? "rotate-180" : "")}
                    />
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
                          {/* Model selector */}
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">
                              {provider === "veo" ? "Veo Model" : "Kling Model"}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {(provider === "veo" ? VEO_MODELS : KLING_MODELS).map((m) => (
                                <button
                                  key={m.value}
                                  onClick={() => provider === "veo" ? setVeoModel(m.value as VeoModel) : setKlingModel(m.value)}
                                  className={clsx(
                                    "rounded-lg border px-2 py-2 text-left text-xs transition-all",
                                    (provider === "veo" ? veoModel : klingModel) === m.value
                                      ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                                      : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim"
                                  )}
                                >
                                  <p className="font-semibold">{m.label}</p>
                                  <p className="text-[10px] opacity-70">{m.badge}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Aspect ratio + Duration */}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Aspect Ratio</label>
                              <div className="flex flex-wrap gap-1.5">
                                {ASPECT_RATIOS.map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => setAspectRatio(r)}
                                    className={clsx(
                                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-all",
                                      aspectRatio === r
                                        ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                                        : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim"
                                    )}
                                  >
                                    {r}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {tabMode === "video" && (
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Duration</label>
                                <div className="flex gap-1.5">
                                  {DURATIONS.map((d) => (
                                    <button
                                      key={d}
                                      onClick={() => setDuration(d)}
                                      className={clsx(
                                        "rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                                        duration === d
                                          ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                                          : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim"
                                      )}
                                    >
                                      {d}s
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Camera movement */}
                          {tabMode === "video" && provider === "veo" && (
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Camera Movement</label>
                              <div className="flex flex-wrap gap-1.5">
                                {CAMERA_MOVES.map((m) => (
                                  <button
                                    key={m}
                                    onClick={() => setCameraMove(m)}
                                    className={clsx(
                                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold border capitalize transition-all",
                                      cameraMove === m
                                        ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                                        : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim"
                                    )}
                                  >
                                    {m.replace("_", " ")}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* CTA */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={tabMode === "video" ? generateRefImages : generateRefImages}
                  disabled={!prompt.trim()}
                  className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold"
                >
                  <Wand2 size={18} />
                  Generate 3 Reference Images
                </motion.button>
              </motion.div>
            )}

            {/* ── PHASE: gen-ref (loading 3 images) ───────────────────────── */}
            {phase === "gen-ref" && (
              <motion.div
                key="gen-ref"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-tt-accent border-t-transparent" />
                  <p className="text-sm font-semibold text-tt-text">Generating reference images…</p>
                  <span className="text-xs text-tt-muted">This may take 30–60s</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="aspect-video skeleton rounded-xl"
                    />
                  ))}
                </div>
                <p className="text-center text-xs text-tt-muted">
                  Prompt: <span className="text-tt-text">{prompt}</span>
                </p>
              </motion.div>
            )}

            {/* ── PHASE: pick-ref (user selects image) ─────────────────────── */}
            {phase === "pick-ref" && (
              <motion.div
                key="pick-ref"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-tt-text">Choose Your Reference</h2>
                    <p className="text-xs text-tt-muted">Hover to select, then click Animate</p>
                  </div>
                  <button onClick={reset} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-tt-muted hover:text-tt-text hover:bg-tt-card border border-tt-border transition-all">
                    <RotateCcw size={13} /> Start over
                  </button>
                </div>

                {/* 3 image cards */}
                <div className="grid grid-cols-3 gap-3">
                  {refImages.map((img, i) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08 }}
                      onClick={() => !img.loading && !img.error && setSelectedRef(img)}
                      className={clsx(
                        "group relative aspect-video cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-200",
                        selectedRef?.id === img.id
                          ? "border-tt-accent shadow-glow-accent"
                          : "border-tt-border hover:border-tt-accent/60"
                      )}
                    >
                      {img.loading ? (
                        <div className="skeleton h-full w-full" />
                      ) : img.error ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-950/30 text-red-400">
                          <AlertCircle size={20} />
                          <span className="text-[10px]">Failed</span>
                        </div>
                      ) : img.url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />

                          {/* Hover overlay */}
                          <div className="image-card-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end pb-3">
                            {selectedRef?.id === img.id ? (
                              <span className="flex items-center gap-1 rounded-full bg-tt-accent px-3 py-1.5 text-xs font-bold text-black">
                                <Check size={12} /> Selected
                              </span>
                            ) : (
                              <span className="rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs font-semibold text-white">
                                Select
                              </span>
                            )}
                          </div>

                          {/* Selected checkmark */}
                          {selectedRef?.id === img.id && (
                            <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-tt-accent">
                              <Check size={12} className="text-black" />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-tt-card text-tt-muted">
                          <ImageIcon size={24} />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Regenerate option */}
                <button
                  onClick={generateRefImages}
                  className="flex items-center gap-2 text-xs text-tt-muted hover:text-tt-text transition-colors"
                >
                  <RotateCcw size={13} /> Regenerate options
                </button>

                {/* Animate CTA */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={animateReference}
                  disabled={!selectedRef && !uploadedRef}
                  className="btn-accent w-full flex items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold"
                >
                  <Film size={18} />
                  Animate → Generate 2 Videos
                </motion.button>
              </motion.div>
            )}

            {/* ── PHASE: animating (video generation in progress) ──────────── */}
            {phase === "animating" && (
              <motion.div
                key="animating"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-base font-bold text-tt-text">Generating your videos…</h2>
                  <p className="text-xs text-tt-muted mt-1">This may take 1–3 minutes. You can leave this tab open.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {videos.map((v, i) => (
                    <motion.div
                      key={v.slotId}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.12 }}
                      className="overflow-hidden rounded-xl border border-tt-border bg-tt-card"
                    >
                      {/* Video placeholder with progress */}
                      <div className="aspect-video flex flex-col items-center justify-center gap-4 bg-tt-surface">
                        {v.status === "FAILED" ? (
                          <div className="flex flex-col items-center gap-2 text-red-400">
                            <AlertCircle size={24} />
                            <p className="text-xs text-center">{v.error ?? "Generation failed"}</p>
                          </div>
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
                        {v.status !== "FAILED" && (
                          <Loader2 size={14} className="animate-spin text-tt-accent" />
                        )}
                        <p className="text-xs text-tt-muted">
                          {v.status === "FAILED" ? "Failed" : `~${Math.round((100 - v.progress) / 10)} min remaining`}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Selected reference thumbnail */}
                {(selectedRef?.url || uploadedRef) && (
                  <div className="flex items-center gap-3 rounded-xl border border-tt-border bg-tt-card p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedRef?.url ?? uploadedRef!.objectUrl}
                      alt="Approved reference"
                      className="h-14 w-24 rounded-lg object-cover border border-tt-border"
                    />
                    <div>
                      <p className="text-xs font-semibold text-tt-accent">Approved Reference</p>
                      <p className="text-[11px] text-tt-muted mt-0.5">Animating with {provider === "veo" ? veoModel : klingModel}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── PHASE: done (videos ready) ───────────────────────────────── */}
            {phase === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-tt-text">Your Videos Are Ready!</h2>
                    <p className="text-xs text-tt-muted mt-1">Hover a video to add voiceover or download</p>
                  </div>
                  <button onClick={reset} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-tt-muted hover:text-tt-text hover:bg-tt-card border border-tt-border transition-all">
                    <RotateCcw size={13} /> New creation
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {videos.map((v, i) => (
                    <VideoResultCard
                      key={v.slotId}
                      video={v}
                      index={i}
                      onVoiceover={() => { setVoiceoverVideo(v); setVoiceoverOpen(true); }}
                    />
                  ))}
                </div>

                {/* Approved reference */}
                {(selectedRef?.url || uploadedRef) && (
                  <div className="flex items-center gap-3 rounded-xl border border-tt-accent/20 bg-tt-accent/5 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedRef?.url ?? uploadedRef!.objectUrl}
                      alt="Reference used"
                      className="h-14 w-24 rounded-lg object-cover border border-tt-border"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-tt-accent">Approved Reference Used</p>
                      <p className="text-[11px] text-tt-muted mt-0.5 line-clamp-2">{prompt}</p>
                    </div>
                    <button
                      onClick={reset}
                      className="btn-accent flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
                    >
                      <Wand2 size={13} /> New
                    </button>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Voiceover modal */}
      <VoiceoverModal
        open={voiceoverOpen}
        onClose={() => setVoiceoverOpen(false)}
        videoUrl={voiceoverVideo?.url}
      />
    </>
  );
}

// ── VideoResultCard sub-component ─────────────────────────────────────────────

function VideoResultCard({
  video,
  index,
  onVoiceover,
}: {
  video: VideoResult;
  index: number;
  onVoiceover: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="group overflow-hidden rounded-xl border border-tt-border bg-tt-card transition-all duration-300 hover:border-tt-accent/40 hover:shadow-card-hover"
    >
      {/* Video area */}
      <div className="relative aspect-video bg-tt-surface">
        {video.status === "COMPLETED" && video.url ? (
          playing ? (
            <video
              src={video.url}
              autoPlay
              controls
              className="h-full w-full object-cover"
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <div className="relative h-full w-full">
              <div className="h-full w-full bg-gradient-to-br from-tt-surface to-tt-card" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <button
                  onClick={() => setPlaying(true)}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all hover:scale-110"
                >
                  <Play size={22} className="ml-1 text-white" />
                </button>
                <p className="text-xs font-semibold text-tt-accent">Video {index + 1} Ready</p>
              </div>

              {/* Hover overlay with actions */}
              <AnimatePresence>
                {hovered && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 image-card-overlay flex flex-col items-center justify-end pb-4 gap-2"
                  >
                    <motion.button
                      initial={{ y: 12, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 12, opacity: 0 }}
                      onClick={onVoiceover}
                      className="flex items-center gap-2 rounded-full bg-tt-accent px-4 py-2 text-xs font-bold text-black hover:shadow-glow-accent transition-all"
                    >
                      <Mic size={13} />
                      Add Voiceover
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        ) : video.status === "FAILED" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-red-400">
            <AlertCircle size={24} />
            <p className="text-xs">{video.error ?? "Generation failed"}</p>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            <CircularProgress value={video.progress} size={60} />
            <p className="text-xs text-tt-muted capitalize">{video.status.toLowerCase()}…</p>
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          {video.status === "COMPLETED" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-tt-accent">
              <Check size={12} /> Ready
            </span>
          ) : video.status === "FAILED" ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-red-400">
              <AlertCircle size={12} /> Failed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-tt-muted">
              <Clock size={12} /> Processing
            </span>
          )}
        </div>
        {video.status === "COMPLETED" && video.url && (
          <a
            href={video.url}
            download
            className="flex items-center gap-1 text-[11px] text-tt-muted hover:text-tt-text transition-colors"
          >
            <Download size={13} /> Download
          </a>
        )}
      </div>
    </motion.div>
  );
}
