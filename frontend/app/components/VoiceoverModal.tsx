"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, Upload, ChevronDown, Captions, Sparkles, Check } from "lucide-react";

interface VoiceoverModalProps {
  open: boolean;
  onClose: () => void;
  videoUrl?: string;
}

const VOICES = [
  { id: "alloy",   label: "Alloy",   desc: "Neutral, clear"     },
  { id: "echo",    label: "Echo",    desc: "Warm, conversational" },
  { id: "fable",   label: "Fable",   desc: "Expressive, dynamic" },
  { id: "onyx",    label: "Onyx",    desc: "Deep, authoritative" },
  { id: "nova",    label: "Nova",    desc: "Friendly, energetic"  },
  { id: "shimmer", label: "Shimmer", desc: "Soft, professional"  },
];

export function VoiceoverModal({ open, onClose, videoUrl }: VoiceoverModalProps) {
  const [script, setScript] = useState("");
  const [voice, setVoice]   = useState(VOICES[0].id);
  const [captions, setCaptions] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    setGenerating(true);
    // Simulate generation (real integration goes here)
    await new Promise((r) => setTimeout(r, 2500));
    setGenerating(false);
    setDone(true);
    setTimeout(() => { setDone(false); onClose(); }, 1500);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-tt-border bg-tt-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-tt-border px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tt-accent/10">
                  <Mic size={16} className="text-tt-accent" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-tt-text">Add Voiceover</h2>
                  <p className="text-xs text-tt-muted">Generate AI narration for your video</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-tt-muted hover:bg-tt-border hover:text-tt-text transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {/* Script */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                  Script
                </label>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Enter your voiceover script here…"
                  rows={4}
                  className="w-full resize-none rounded-xl border border-tt-border bg-tt-surface px-4 py-3 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
                />
                <p className="text-right text-[11px] text-tt-muted">{script.length} chars</p>
              </div>

              {/* Voice selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                  Select a Voice
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {VOICES.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVoice(v.id)}
                      className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all ${
                        voice === v.id
                          ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent"
                          : "border-tt-border bg-tt-surface text-tt-muted hover:border-tt-dim hover:text-tt-text"
                      }`}
                    >
                      <span className="text-xs font-semibold">{v.label}</span>
                      <span className="text-[10px] opacity-70">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload audio */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-tt-muted">
                  Or Upload Audio (optional)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-tt-border bg-tt-surface px-4 py-3 text-sm text-tt-muted hover:border-tt-accent/40 hover:text-tt-text transition-all"
                >
                  <Upload size={16} />
                  {audioFile ? audioFile.name : "Drop or click to upload .mp3 / .wav"}
                </button>
              </div>

              {/* Captions toggle */}
              <div className="flex items-center justify-between rounded-xl border border-tt-border bg-tt-surface px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-tt-text">
                  <Captions size={16} className="text-tt-muted" />
                  Show captions
                </div>
                <button
                  onClick={() => setCaptions((c) => !c)}
                  className={`relative h-5 w-9 rounded-full transition-all duration-200 ${captions ? "bg-tt-accent" : "bg-tt-border"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${captions ? "left-[18px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-tt-border px-6 py-4">
              <button
                onClick={handleGenerate}
                disabled={generating || done || !script.trim()}
                className="btn-accent flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold disabled:opacity-50"
              >
                {done ? (
                  <><Check size={16} /> Done!</>
                ) : generating ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" /> Generating…</>
                ) : (
                  <><Sparkles size={16} /> Generate Voiceover</>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
