"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Sparkles, Loader2, Check, ChevronRight,
  ImageIcon, Clapperboard, Play, RefreshCw, AlertCircle,
  ArrowLeft, Zap, Video,
} from "lucide-react";
import { clsx } from "clsx";
import {
  listAvatars, Avatar,
  symphonyNanoEdit, symphonyGenerate, symphonyStatus,
  NanoEditResult, SymphonyJobStatus,
} from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

type Model = "runway" | "veo";

interface Settings {
  model:        Model;
  prompt:       string;
  aspectRatio:  "16:9" | "9:16" | "1:1";
  duration:     5 | 10;
  enhancePrompt: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  model:        "runway",
  prompt:       "",
  aspectRatio:  "16:9",
  duration:     5,
  enhancePrompt: true,
};

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ n, current, label }: { n: Step; current: Step; label: string }) {
  const done    = current > n;
  const active  = current === n;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
        done   ? "border-tt-accent bg-tt-accent text-black"   :
        active ? "border-tt-accent bg-tt-accent/10 text-tt-accent" :
                 "border-tt-border bg-tt-card text-tt-muted"
      )}>
        {done ? <Check size={14} /> : n}
      </div>
      <span className={clsx("text-[10px] font-semibold hidden sm:block",
        active ? "text-tt-accent" : "text-tt-muted"
      )}>{label}</span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div className={clsx("h-0.5 flex-1 rounded-full transition-colors mx-1",
      done ? "bg-tt-accent" : "bg-tt-border"
    )} />
  );
}

// ── File drop zone ────────────────────────────────────────────────────────────

function DropZone({ onFile, preview }: { onFile: (f: File) => void; preview: string | null }) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function handle(f: File) {
    if (!f.type.startsWith("image/")) return;
    onFile(f);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all overflow-hidden",
        drag  ? "border-tt-accent bg-tt-accent/10 scale-[1.01]" :
        preview ? "border-tt-accent/50" : "border-tt-border bg-tt-card hover:border-tt-accent/40 hover:bg-tt-card/80",
        preview ? "aspect-video" : "h-52"
      )}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Source" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2 rounded-xl bg-white/20 backdrop-blur-sm px-4 py-2.5 text-sm font-semibold text-white">
              <RefreshCw size={14} /> Change image
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-tt-border bg-tt-surface">
            <Upload size={22} className="text-tt-muted" />
          </div>
          <div>
            <p className="text-sm font-semibold text-tt-text">Drop an image here</p>
            <p className="mt-0.5 text-xs text-tt-muted">or click to browse · PNG, JPG, WEBP</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Avatar picker ─────────────────────────────────────────────────────────────

function AvatarPicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAvatars()
      .then(setAvatars)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 text-tt-muted text-sm py-4">
      <Loader2 size={16} className="animate-spin" /> Loading avatars…
    </div>
  );

  if (avatars.length === 0) return (
    <p className="text-xs text-tt-muted py-2">No custom avatars yet — skip this step or train one first.</p>
  );

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
          selected === null
            ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
            : "border-tt-border bg-tt-card text-tt-muted hover:text-tt-text"
        )}
      >
        None
      </button>
      {avatars.filter((a) => a.status === "READY").map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(selected === a.id ? null : a.id)}
          className={clsx(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
            selected === a.id
              ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
              : "border-tt-border bg-tt-card text-tt-muted hover:text-tt-text"
          )}
        >
          {a.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.image_url} alt={a.name} className="h-5 w-5 rounded-full object-cover" />
          )}
          {a.name}
          {selected === a.id && <Check size={12} />}
        </button>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SymphonyCreator() {
  const [step, setStep]               = useState<Step>(1);

  // Step 1 — source image
  const [sourceFile, setSourceFile]   = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [avatarId, setAvatarId]       = useState<string | null>(null);

  // Step 2 — swap prompt + edit parameters
  const [swapPrompt, setSwapPrompt]     = useState("");
  const [nanoLoading, setNanoLoading]   = useState(false);
  const [nanoError, setNanoError]       = useState<string | null>(null);
  const [nanoResult, setNanoResult]     = useState<NanoEditResult | null>(null);
  const [imageStrength, setImageStrength] = useState(0.22);
  const [guidanceScale, setGuidanceScale] = useState(4.5);
  const [editSeed, setEditSeed]           = useState<string>("");  // "" = no seed

  // Step 4 — generation settings
  const [settings, setSettings]       = useState<Settings>(DEFAULT_SETTINGS);

  // Step 5 — generation
  const [jobId, setJobId]             = useState<string | null>(null);
  const [jobStatus, setJobStatus]     = useState<SymphonyJobStatus | null>(null);
  const [genError, setGenError]       = useState<string | null>(null);
  const [genLoading, setGenLoading]   = useState(false);
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSourceFile(f: File) {
    setSourceFile(f);
    setSourcePreview(URL.createObjectURL(f));
  }

  async function handleNanoEdit() {
    if (!swapPrompt.trim()) return;
    setNanoLoading(true);
    setNanoError(null);
    try {
      const seedNum = editSeed.trim() !== "" ? parseInt(editSeed, 10) : null;
      const result = await symphonyNanoEdit(
        sourceFile ? [sourceFile] : null,   // null → MODE A (generate)
        swapPrompt.trim(),
        {
          avatarId:      avatarId ?? undefined,
          imageStrength,
          guidanceScale,
          seed:          Number.isFinite(seedNum) ? seedNum : null,
        },
      );
      setNanoResult(result);
      setStep(3);
    } catch (e) {
      setNanoError(String(e));
    } finally {
      setNanoLoading(false);
    }
  }

  async function handleGenerate() {
    if (!nanoResult || !settings.prompt.trim()) return;
    const editedUrl = nanoResult.edited_image_url ?? nanoResult.gcs_url;
    if (!editedUrl) { setGenError("No edited image URL returned from Nano Banana."); return; }

    setGenLoading(true);
    setGenError(null);
    try {
      const res = await symphonyGenerate({
        edited_image_url: editedUrl,
        model:            settings.model,
        prompt:           settings.prompt.trim(),
        avatar_id:        avatarId,
        aspect_ratio:     settings.aspectRatio,
        duration:         settings.duration,
        enhance_prompt:   settings.enhancePrompt,
      });
      setJobId(res.job_id);
      setStep(5);
      startPolling(res.job_id);
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenLoading(false);
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await symphonyStatus(id);
        setJobStatus(s);
        if (s.status === "COMPLETED" || s.status === "FAILED") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch {}
    }, 3000);
  }

  function restart() {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep(1);
    setSourceFile(null);
    setSourcePreview(null);
    setAvatarId(null);
    setSwapPrompt("");
    setNanoResult(null);
    setNanoError(null);
    setImageStrength(0.22);
    setGuidanceScale(4.5);
    setEditSeed("");
    setSettings(DEFAULT_SETTINGS);
    setJobId(null);
    setJobStatus(null);
    setGenError(null);
    setGenLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const STEPS: { label: string }[] = [
    { label: "Source" },
    { label: "Swap"   },
    { label: "Preview"},
    { label: "Setup"  },
    { label: "Export" },
  ];

  return (
    <div className="flex h-screen flex-col bg-tt-bg">

      {/* ── Header ── */}
      <div className="border-b border-tt-border bg-tt-surface/80 backdrop-blur px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-tt-accent">
              <Clapperboard size={18} className="text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-tt-text">Symphony Creator</h1>
              <p className="text-xs text-tt-muted">UGC image → Nano Banana swap → AI video</p>
            </div>
          </div>
          {step > 1 && (
            <button
              onClick={restart}
              className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-4 py-2 text-xs font-semibold text-tt-muted hover:text-tt-text transition-all"
            >
              <RefreshCw size={13} /> Start over
            </button>
          )}
        </div>

        {/* Step progress */}
        <div className="mt-5 flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center">
              <StepDot n={(i + 1) as Step} current={step} label={s.label} />
              {i < STEPS.length - 1 && <StepConnector done={step > i + 1} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">

          {/* STEP 1 — Source image + optional avatar */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mx-auto max-w-xl space-y-6">
              <div>
                <p className="mb-1 text-sm font-bold text-tt-text">Upload source image</p>
                <p className="mb-3 text-xs text-tt-muted">The UGC photo you want to brand-swap.</p>
                <DropZone onFile={handleSourceFile} preview={sourcePreview} />
              </div>

              <div>
                <p className="mb-1 text-sm font-bold text-tt-text">Avatar <span className="font-normal text-tt-muted">(optional)</span></p>
                <p className="mb-3 text-xs text-tt-muted">Link to a custom Runway creator to lock in their likeness.</p>
                <AvatarPicker selected={avatarId} onSelect={setAvatarId} />
              </div>

              {!sourceFile && (
                <p className="text-xs text-tt-muted text-center">
                  No image? That&apos;s fine — you&apos;ll generate a new one from your prompt.
                </p>
              )}
              <button
                onClick={() => setStep(2)}
                className="btn-accent flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
              >
                Continue <ChevronRight size={16} />
              </button>
            </motion.div>
          )}

          {/* STEP 2 — Swap / generate prompt */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mx-auto max-w-xl space-y-6">

              {/* Mode badge + source image preview */}
              <div className="rounded-2xl border border-tt-border bg-tt-card overflow-hidden">
                {sourcePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sourcePreview} alt="Source" className="w-full object-cover max-h-48" />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-tt-surface">
                    <ImageIcon size={28} className="text-tt-muted" />
                  </div>
                )}
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-tt-muted">
                      {sourceFile ? "Source image" : "No image — generate mode"}
                    </p>
                    <p className="mt-0.5 text-sm text-tt-text truncate">
                      {sourceFile?.name ?? "New image will be generated from your prompt"}
                    </p>
                  </div>
                  <span className={clsx(
                    "rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                    sourceFile
                      ? "bg-tt-accent/15 text-tt-accent"
                      : "bg-purple-500/15 text-purple-400"
                  )}>
                    {sourceFile ? "Edit" : "Generate"}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-tt-text">
                  {sourceFile ? "Brand swap prompt" : "Generation prompt"}
                </label>
                <p className="mb-3 text-xs text-tt-muted">
                  {sourceFile
                    ? <>Describe what to change — e.g. <em>&quot;Replace the white t-shirt with a Nike dri-fit in coral red&quot;</em></>
                    : "Describe the image you want to create from scratch."}
                </p>
                <textarea
                  value={swapPrompt}
                  onChange={(e) => setSwapPrompt(e.target.value)}
                  placeholder={sourceFile
                    ? "Replace the plain t-shirt with a branded hoodie in midnight blue with the Acme logo on the chest…"
                    : "Black american man, 55 yrs old, holding a product near a pool, photoreal UGC iPhone style…"}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-tt-border bg-tt-surface px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                />
              </div>

              {/* Edit parameters — only shown in edit mode */}
              {sourceFile && (
                <div className="rounded-xl border border-tt-border bg-tt-card p-4 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-tt-muted">Edit parameters</p>

                  {/* image_strength */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-tt-text">Edit intensity</label>
                      <span className="text-xs font-mono text-tt-accent">{imageStrength.toFixed(2)}</span>
                    </div>
                    <input
                      type="range" min={0.10} max={0.35} step={0.01}
                      value={imageStrength}
                      onChange={(e) => setImageStrength(parseFloat(e.target.value))}
                      className="w-full accent-tt-accent"
                    />
                    <div className="flex justify-between text-[10px] text-tt-muted mt-0.5">
                      <span>Subtle (0.10)</span><span>Strong (0.35)</span>
                    </div>
                  </div>

                  {/* guidance_scale */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-tt-text">Prompt adherence</label>
                      <span className="text-xs font-mono text-tt-accent">{guidanceScale.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={3} max={7} step={0.1}
                      value={guidanceScale}
                      onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                      className="w-full accent-tt-accent"
                    />
                    <div className="flex justify-between text-[10px] text-tt-muted mt-0.5">
                      <span>Creative (3)</span><span>Strict (7)</span>
                    </div>
                  </div>

                  {/* seed */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-tt-text">
                      Seed <span className="font-normal text-tt-muted">(optional — leave blank for random)</span>
                    </label>
                    <input
                      type="number" min={0} placeholder="e.g. 42"
                      value={editSeed}
                      onChange={(e) => setEditSeed(e.target.value)}
                      className="w-full rounded-xl border border-tt-border bg-tt-surface px-3 py-2 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                    />
                  </div>
                </div>
              )}

              {nanoError && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{nanoError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-5 py-3 text-sm font-semibold text-tt-muted hover:text-tt-text transition-all"
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <button
                  onClick={handleNanoEdit}
                  disabled={nanoLoading || !swapPrompt.trim()}
                  className="btn-accent flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
                >
                  {nanoLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> {sourceFile ? "Applying swap…" : "Generating…"}</>
                  ) : (
                    <><Sparkles size={16} /> {sourceFile ? "Apply Brand Swap" : "Generate Image"}</>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — Preview result */}
          {step === 3 && nanoResult && (
            <motion.div key="step3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mx-auto max-w-2xl space-y-6">
              <p className="text-sm font-bold text-tt-text">
                {sourceFile ? "Brand swap preview" : "Generated image"}
              </p>

              <div className={clsx("gap-4", sourceFile ? "grid grid-cols-2" : "flex justify-center")}>
                {/* Original — edit mode only */}
                {sourceFile && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-tt-muted uppercase tracking-wider">Original</p>
                    <div className="overflow-hidden rounded-2xl border border-tt-border aspect-video bg-tt-card">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {sourcePreview && <img src={sourcePreview} alt="Original" className="h-full w-full object-cover" />}
                    </div>
                  </div>
                )}

                {/* Result image — both modes */}
                <div className={clsx("space-y-2", !sourceFile && "w-full max-w-lg")}>
                  <p className="text-xs font-semibold text-tt-accent uppercase tracking-wider flex items-center gap-1">
                    <Sparkles size={11} /> {sourceFile ? "After swap" : "Generated"}
                  </p>
                  <div className="overflow-hidden rounded-2xl border border-tt-accent/40 aspect-video bg-tt-card">
                    {(nanoResult.edited_image_url ?? nanoResult.gcs_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={nanoResult.edited_image_url ?? nanoResult.gcs_url ?? ""}
                        alt={sourceFile ? "Swapped" : "Generated"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon size={28} className="text-tt-muted" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-tt-border bg-tt-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-tt-muted mb-1">Prompt used</p>
                <p className="text-sm text-tt-text">{nanoResult.original_prompt}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setNanoResult(null); setStep(2); }}
                  className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-5 py-3 text-sm font-semibold text-tt-muted hover:text-tt-text transition-all"
                >
                  <RefreshCw size={15} /> {sourceFile ? "Re-swap" : "Re-generate"}
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="btn-accent flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
                >
                  Looks good — set up video <ChevronRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4 — Video generation settings */}
          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mx-auto max-w-xl space-y-6">

              {/* Model selector */}
              <div>
                <p className="mb-3 text-sm font-bold text-tt-text">Video model</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["runway", "veo"] as Model[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSettings((s) => ({ ...s, model: m }))}
                      className={clsx(
                        "flex flex-col items-start gap-1.5 rounded-2xl border-2 p-4 text-left transition-all",
                        settings.model === m
                          ? "border-tt-accent bg-tt-accent/10"
                          : "border-tt-border bg-tt-card hover:border-tt-accent/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {m === "runway" ? <Zap size={15} className="text-tt-accent" /> : <Video size={15} className="text-purple-400" />}
                        <span className="text-sm font-bold text-tt-text capitalize">{m === "runway" ? "Runway Gen-4" : "Google Veo"}</span>
                      </div>
                      <p className="text-[11px] text-tt-muted">
                        {m === "runway" ? "Fastest · great motion · 5–10 s" : "Highest quality · cinematic · 5–10 s"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div>
                <label className="mb-1 block text-sm font-bold text-tt-text">Video prompt</label>
                <p className="mb-3 text-xs text-tt-muted">Describe the scene and motion for the final video.</p>
                <textarea
                  value={settings.prompt}
                  onChange={(e) => setSettings((s) => ({ ...s, prompt: e.target.value }))}
                  placeholder="Person holds the product up to camera, smiling naturally, soft studio light, slow dolly in…"
                  rows={4}
                  className="w-full resize-none rounded-xl border border-tt-border bg-tt-surface px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                />
              </div>

              {/* Aspect ratio + duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-tt-muted">Aspect ratio</label>
                  <div className="flex gap-2">
                    {(["16:9", "9:16", "1:1"] as const).map((ar) => (
                      <button
                        key={ar}
                        onClick={() => setSettings((s) => ({ ...s, aspectRatio: ar }))}
                        className={clsx(
                          "flex-1 rounded-xl border py-2 text-xs font-bold transition-all",
                          settings.aspectRatio === ar
                            ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                            : "border-tt-border bg-tt-card text-tt-muted hover:text-tt-text"
                        )}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-tt-muted">Duration</label>
                  <div className="flex gap-2">
                    {([5, 10] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setSettings((s) => ({ ...s, duration: d }))}
                        className={clsx(
                          "flex-1 rounded-xl border py-2 text-xs font-bold transition-all",
                          settings.duration === d
                            ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                            : "border-tt-border bg-tt-card text-tt-muted hover:text-tt-text"
                        )}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Enhance prompt toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setSettings((s) => ({ ...s, enhancePrompt: !s.enhancePrompt }))}
                  className={clsx(
                    "relative h-5 w-9 rounded-full transition-colors",
                    settings.enhancePrompt ? "bg-tt-accent" : "bg-tt-border"
                  )}
                >
                  <div className={clsx(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    settings.enhancePrompt ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
                <span className="text-sm text-tt-text">AI prompt enhancement</span>
              </label>

              {genError && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{genError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-5 py-3 text-sm font-semibold text-tt-muted hover:text-tt-text transition-all"
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={genLoading || !settings.prompt.trim()}
                  className="btn-accent flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
                >
                  {genLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                  ) : (
                    <><Play size={16} /> Generate Video</>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 5 — Polling / result */}
          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="mx-auto max-w-xl space-y-6">

              {/* Status card */}
              <div className="rounded-2xl border border-tt-border bg-tt-card p-6 text-center space-y-4">
                {(!jobStatus || jobStatus.status === "PENDING" || jobStatus.status === "PROCESSING") && (
                  <>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-tt-accent/30 bg-tt-accent/10">
                      <Loader2 size={28} className="animate-spin text-tt-accent" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-tt-text">Generating your video</p>
                      <p className="mt-1 text-xs text-tt-muted">
                        {jobStatus?.status === "PROCESSING" ? "Processing with " : "Queued for "}
                        <span className="capitalize font-semibold text-tt-text">{settings.model === "runway" ? "Runway Gen-4" : "Google Veo"}</span>
                        {" — this may take 60–120 seconds"}
                      </p>
                    </div>
                    {jobStatus?.progress !== undefined && jobStatus.progress > 0 && (
                      <div className="space-y-1.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-tt-border">
                          <motion.div
                            animate={{ width: `${jobStatus.progress}%` }}
                            className="h-full rounded-full bg-tt-accent"
                          />
                        </div>
                        <p className="text-xs text-tt-accent font-semibold">{jobStatus.progress}%</p>
                      </div>
                    )}
                  </>
                )}

                {jobStatus?.status === "COMPLETED" && (
                  <>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-green-500/40 bg-green-500/10">
                      <Check size={28} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-tt-text">Video ready!</p>
                      <p className="mt-1 text-xs text-tt-muted">Generated with <span className="capitalize font-semibold text-tt-text">{jobStatus.model_used}</span></p>
                    </div>
                    {jobStatus.video_url && (
                      <video
                        src={jobStatus.video_url}
                        controls
                        autoPlay
                        loop
                        className="w-full rounded-xl border border-tt-border mt-2"
                      />
                    )}
                    <div className="flex gap-3 justify-center pt-2">
                      {jobStatus.video_url && (
                        <a
                          href={jobStatus.video_url}
                          download
                          className="btn-accent flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                        >
                          Download
                        </a>
                      )}
                      <button
                        onClick={restart}
                        className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-5 py-2.5 text-sm font-semibold text-tt-muted hover:text-tt-text transition-all"
                      >
                        <RefreshCw size={14} /> Create another
                      </button>
                    </div>
                  </>
                )}

                {jobStatus?.status === "FAILED" && (
                  <>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500/40 bg-red-500/10">
                      <AlertCircle size={28} className="text-red-400" />
                    </div>
                    <div>
                      <p className="text-base font-bold text-tt-text">Generation failed</p>
                      {jobStatus.error_message && (
                        <p className="mt-1 text-xs text-red-300">{jobStatus.error_message}</p>
                      )}
                    </div>
                    <button
                      onClick={() => { setStep(4); setJobId(null); setJobStatus(null); }}
                      className="flex items-center gap-2 rounded-xl border border-tt-border bg-tt-card px-5 py-2.5 text-sm font-semibold text-tt-muted hover:text-tt-text transition-all mx-auto"
                    >
                      <ArrowLeft size={14} /> Adjust & retry
                    </button>
                  </>
                )}
              </div>

              {/* Job meta */}
              {jobId && (
                <div className="rounded-xl border border-tt-border bg-tt-card p-4 space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-tt-muted">Job details</p>
                  <p className="text-xs text-tt-muted">ID: <span className="font-mono text-tt-text">{jobId}</span></p>
                  <p className="text-xs text-tt-muted">Model: <span className="font-semibold text-tt-text capitalize">{settings.model === "runway" ? "Runway Gen-4 Turbo" : "Google Veo"}</span></p>
                  <p className="text-xs text-tt-muted">Format: <span className="font-semibold text-tt-text">{settings.aspectRatio} · {settings.duration}s</span></p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
