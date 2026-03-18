"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Upload, Film, Mic, Package, Sparkles, Check,
  Loader2, AlertCircle, ChevronRight, User, Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { trainAiCreator, getAvatarStatus, Avatar } from "../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrainCreatorModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: (avatar: Avatar) => void;
}

type Stage = "form" | "uploading" | "training" | "done" | "error";

// ── Training status messages ──────────────────────────────────────────────────

const TRAINING_MESSAGES = [
  "Uploading training data…",
  "Creating Runway Character…",
  "Analyzing UGC clips…",
  "Fine-tuning Gen-4.5 model…",
  "Training visual identity…",
  "Learning motion patterns…",
  "Optimizing voice synthesis…",
  "Rendering first test frame…",
  "Finalizing custom model…",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function TrainCreatorModal({ open, onClose, onCreated }: TrainCreatorModalProps) {
  const [stage, setStage]               = useState<Stage>("form");
  const [name, setName]                 = useState("");
  const [description, setDescription]   = useState("");
  const [voiceClone, setVoiceClone]     = useState(false);
  const [productLock, setProductLock]   = useState(false);
  const [files, setFiles]               = useState<File[]>([]);
  const [isDragging, setIsDragging]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [progress, setProgress]         = useState(0);
  const [statusMsg, setStatusMsg]       = useState(TRAINING_MESSAGES[0]);
  const [avatarId, setAvatarId]         = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgIdxRef    = useRef(0);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStage("form");
      setName("");
      setDescription("");
      setVoiceClone(false);
      setProductLock(false);
      setFiles([]);
      setError(null);
      setProgress(0);
      setAvatarId(null);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open]);

  // ── File handling ───────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setFiles((prev) => {
      const combined = [...prev, ...arr];
      return combined.slice(0, 1000); // cap at 1000 files
    });
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  // ── Training poll ───────────────────────────────────────────────────────────

  function startPolling(id: string) {
    setAvatarId(id);
    msgIdxRef.current = 2; // Start past "Uploading…" and "Creating character…"

    pollRef.current = setInterval(async () => {
      try {
        const avatar = await getAvatarStatus(id);
        const serverProgress = avatar.training_progress ?? 0;

        setProgress(serverProgress);

        // Cycle through training messages
        const msgIdx = Math.min(
          Math.floor((serverProgress / 100) * TRAINING_MESSAGES.length),
          TRAINING_MESSAGES.length - 1
        );
        setStatusMsg(TRAINING_MESSAGES[msgIdx]);

        if (avatar.status === "READY") {
          clearInterval(pollRef.current!);
          setProgress(100);
          setStage("done");
          onCreated(avatar);
        } else if (avatar.status === "FAILED") {
          clearInterval(pollRef.current!);
          setError("Training failed. Please try again or contact support.");
          setStage("error");
        }
      } catch {
        // Keep polling silently on transient errors
      }
    }, 4000);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!name.trim()) { setError("Creator name is required."); return; }
    if (files.length < 1) { setError("Please upload at least 1 training clip."); return; }
    setError(null);
    setStage("uploading");
    setProgress(5);
    setStatusMsg(TRAINING_MESSAGES[0]);

    try {
      setProgress(15);
      setStatusMsg(TRAINING_MESSAGES[1]);

      const res = await trainAiCreator({
        name:                name.trim(),
        description:         description.trim(),
        voice_clone_enabled: voiceClone,
        product_locked:      productLock,
        files,
      });

      setProgress(25);
      setStage("training");
      setStatusMsg(TRAINING_MESSAGES[2]);
      startPolling(res.avatar_id);

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Training failed to start.");
      setStage("error");
    }
  }

  // ── File summary ─────────────────────────────────────────────────────────────

  const videoCount = files.filter((f) => f.type.startsWith("video/")).length;
  const imageCount = files.filter((f) => f.type.startsWith("image/")).length;
  const audioCount = files.filter((f) => f.type.startsWith("audio/")).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={stage === "training" ? undefined : onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-[5vh] z-50 mx-auto max-w-2xl overflow-hidden rounded-2xl border border-tt-border bg-tt-surface shadow-2xl"
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-tt-border px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-tt-accent/20 to-tt-purple/20 border border-tt-accent/20">
                  <Sparkles size={18} className="text-tt-accent" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-tt-text">Train New AI Creator</h2>
                  <p className="text-xs text-tt-muted">Custom Runway Gen-4.5 fine-tuning</p>
                </div>
              </div>
              {stage !== "training" && (
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-tt-muted hover:bg-tt-hover hover:text-tt-text transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 140px)" }}>
              <AnimatePresence mode="wait">

                {/* ── STAGE: form ─────────────────────────────────────────── */}
                {(stage === "form" || stage === "error") && (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-5 p-6"
                  >
                    {/* Error banner */}
                    {error && (
                      <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                        <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-red-400" />
                        <p className="text-sm text-red-300">{error}</p>
                        <button onClick={() => { setError(null); setStage("form"); }} className="ml-auto text-red-400 hover:text-red-200">
                          <X size={13} />
                        </button>
                      </div>
                    )}

                    {/* Creator name + description */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                          Creator Name *
                        </label>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Sofia Martinez"
                          className="w-full rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                          Description
                        </label>
                        <input
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Fitness & lifestyle creator"
                          className="w-full rounded-xl border border-tt-border bg-tt-card px-3 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                        />
                      </div>
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          id: "voice",
                          icon: Mic,
                          label: "Voice Clone",
                          sub: "ElevenLabs voice synthesis",
                          value: voiceClone,
                          set: setVoiceClone,
                          color: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
                          activeText: "text-purple-300",
                        },
                        {
                          id: "product",
                          icon: Package,
                          label: "Product Lock",
                          sub: "Lock to specific products",
                          value: productLock,
                          set: setProductLock,
                          color: "from-orange-500/20 to-orange-600/10 border-orange-500/30",
                          activeText: "text-orange-300",
                        },
                      ].map(({ id, icon: Icon, label, sub, value, set, color, activeText }) => (
                        <button
                          key={id}
                          onClick={() => set((v) => !v)}
                          className={clsx(
                            "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                            value
                              ? `bg-gradient-to-br ${color}`
                              : "border-tt-border bg-tt-card hover:border-tt-dim"
                          )}
                        >
                          <div className={clsx(
                            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                            value ? "bg-white/10" : "bg-tt-border/50"
                          )}>
                            <Icon size={16} className={value ? activeText : "text-tt-muted"} />
                          </div>
                          <div className="min-w-0">
                            <p className={clsx("text-sm font-semibold", value ? activeText : "text-tt-text")}>
                              {label}
                            </p>
                            <p className="text-[11px] text-tt-muted">{sub}</p>
                          </div>
                          <div className={clsx(
                            "ml-auto h-5 w-9 flex-shrink-0 rounded-full border-2 transition-all duration-200",
                            value ? "border-tt-accent bg-tt-accent" : "border-tt-border bg-tt-card"
                          )}>
                            <motion.div
                              animate={{ x: value ? 16 : 2 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="mt-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm"
                            />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Drag-and-drop zone */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                          Training Media
                        </label>
                        <span className="text-[11px] text-tt-muted">
                          {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""} selected` : "200–1000 clips recommended"}
                        </span>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="video/*,image/*,audio/*"
                        className="hidden"
                        onChange={(e) => e.target.files && addFiles(e.target.files)}
                      />

                      <div
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={clsx(
                          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 transition-all duration-200",
                          isDragging
                            ? "border-tt-accent bg-tt-accent/5 scale-[1.01]"
                            : files.length > 0
                            ? "border-tt-accent/40 bg-tt-accent/5"
                            : "border-tt-border bg-tt-card/50 hover:border-tt-accent/30 hover:bg-tt-card"
                        )}
                      >
                        {files.length === 0 ? (
                          <>
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-tt-border/50">
                              <Upload size={24} className="text-tt-muted" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-tt-text">
                                Drop UGC clips here
                              </p>
                              <p className="text-xs text-tt-muted mt-1">
                                Videos, product images, audio files • up to 1000 files
                              </p>
                              <p className="text-xs text-tt-muted">
                                MP4, MOV, JPG, PNG, WAV, MP3
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-4">
                              {videoCount > 0 && (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-tt-accent/15">
                                    <Film size={20} className="text-tt-accent" />
                                  </div>
                                  <span className="text-xs font-semibold text-tt-accent">{videoCount} videos</span>
                                </div>
                              )}
                              {imageCount > 0 && (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/15">
                                    <User size={20} className="text-purple-400" />
                                  </div>
                                  <span className="text-xs font-semibold text-purple-400">{imageCount} images</span>
                                </div>
                              )}
                              {audioCount > 0 && (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15">
                                    <Mic size={20} className="text-orange-400" />
                                  </div>
                                  <span className="text-xs font-semibold text-orange-400">{audioCount} audio</span>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-tt-muted">Click to add more files</p>
                          </>
                        )}
                      </div>

                      {/* File count hint */}
                      {files.length > 0 && files.length < 200 && (
                        <p className="text-[11px] text-amber-400/80">
                          Tip: More clips = better quality. We recommend at least 200 UGC clips.
                        </p>
                      )}
                    </div>

                    {/* Model info card */}
                    <div className="flex items-start gap-3 rounded-xl border border-tt-accent/20 bg-gradient-to-br from-tt-accent/5 to-tt-blue/5 p-4">
                      <Zap size={16} className="mt-0.5 flex-shrink-0 text-tt-accent" />
                      <div>
                        <p className="text-xs font-semibold text-tt-accent">Runway Gen-4.5 Custom Training</p>
                        <p className="text-[11px] text-tt-muted mt-0.5 leading-relaxed">
                          Your creator will be fine-tuned on Runway's latest Gen-4.5 model, producing
                          ultra-realistic UGC videos with consistent identity, voice, and motion style.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── STAGE: uploading / training ──────────────────────────── */}
                {(stage === "uploading" || stage === "training") && (
                  <motion.div
                    key="training"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="flex flex-col items-center gap-8 px-6 py-12"
                  >
                    {/* Animated orb */}
                    <div className="relative">
                      <motion.div
                        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-tt-accent/20 blur-xl"
                      />
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-tt-accent/20 to-tt-purple/20 border border-tt-accent/30">
                        <Sparkles size={32} className="text-tt-accent" />
                      </div>
                    </div>

                    <div className="w-full max-w-sm space-y-4 text-center">
                      <div>
                        <h3 className="text-base font-bold text-tt-text">Training {name}</h3>
                        <p className="text-xs text-tt-muted mt-1">
                          This takes 15–60 minutes. You can close this window — the training will continue.
                        </p>
                      </div>

                      {/* Progress bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-tt-muted">{statusMsg}</span>
                          <span className="font-semibold text-tt-accent">{progress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-tt-border">
                          <motion.div
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-tt-accent to-tt-blue"
                          />
                        </div>
                      </div>

                      {/* Animated dots */}
                      <div className="flex items-center justify-center gap-2">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                            className="h-2 w-2 rounded-full bg-tt-accent"
                          />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── STAGE: done ──────────────────────────────────────────── */}
                {stage === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-6 px-6 py-12"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-tt-accent to-tt-blue shadow-glow-accent"
                    >
                      <Check size={36} className="text-black" />
                    </motion.div>

                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-bold text-tt-text">Creator Ready!</h3>
                      <p className="text-sm text-tt-muted">
                        <span className="font-semibold text-tt-accent">{name}</span> has been
                        trained and added to your Avatar Library.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-tt-accent/20 bg-tt-accent/5 px-4 py-3">
                      <Sparkles size={14} className="text-tt-accent" />
                      <p className="text-xs text-tt-muted">
                        Custom Runway Gen-4.5 model · Ready for video generation
                      </p>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-tt-border px-6 py-4">
              {(stage === "form" || stage === "error") && (
                <>
                  <button
                    onClick={onClose}
                    className="rounded-xl border border-tt-border px-5 py-2.5 text-sm font-semibold text-tt-muted hover:text-tt-text transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    disabled={!name.trim() || files.length === 0}
                    className="btn-accent flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={15} />
                    Start Training
                    <ChevronRight size={15} />
                  </motion.button>
                </>
              )}
              {stage === "training" && (
                <button
                  onClick={onClose}
                  className="rounded-xl border border-tt-border px-5 py-2.5 text-sm font-semibold text-tt-muted hover:text-tt-text transition-colors"
                >
                  Close (training continues in background)
                </button>
              )}
              {stage === "done" && (
                <button
                  onClick={onClose}
                  className="btn-accent flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold"
                >
                  <Check size={15} />
                  Open Avatar Library
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
