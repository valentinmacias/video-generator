"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Play, Check, SlidersHorizontal, Plus, Sparkles, Zap, Clock } from "lucide-react";
import { clsx } from "clsx";
import { TrainCreatorModal } from "../components/TrainCreatorModal";
import { listAvatars, Avatar as ApiAvatar } from "../lib/api";

// ── Unified avatar type (merges mock + real) ───────────────────────────────────

interface DisplayAvatar {
  id:         string;
  name:       string;
  imageUrl:   string;
  gender:     "female" | "male" | "nonbinary";
  age:        "young" | "adult" | "senior";
  gesture:    "holding" | "pointing" | "waving" | "standing";
  background: "studio" | "outdoor" | "urban" | "minimal";
  tags:       string[];
  isCustom:   boolean;
  status:     "READY" | "TRAINING" | "FAILED";
  badge?:     string;
  progress?:  number;
}

// ── Mock library avatars ──────────────────────────────────────────────────────

const MOCK_AVATARS: DisplayAvatar[] = [
  { id: "a1",  name: "Sofia",   imageUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=500&fit=crop&crop=face", gender: "female", age: "young",  gesture: "holding",  background: "studio",  tags: ["model", "lifestyle"],        isCustom: false, status: "READY" },
  { id: "a2",  name: "Marcus",  imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "adult",  gesture: "standing", background: "urban",   tags: ["professional", "casual"],    isCustom: false, status: "READY" },
  { id: "a3",  name: "Zoe",     imageUrl: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=500&fit=crop&crop=face", gender: "female", age: "young",  gesture: "pointing", background: "minimal", tags: ["energetic", "fitness"],      isCustom: false, status: "READY" },
  { id: "a4",  name: "James",   imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "adult",  gesture: "waving",   background: "outdoor", tags: ["outdoor", "adventure"],     isCustom: false, status: "READY" },
  { id: "a5",  name: "Amara",   imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=500&fit=crop&crop=face", gender: "female", age: "adult",  gesture: "holding",  background: "studio",  tags: ["corporate", "style"],       isCustom: false, status: "READY" },
  { id: "a6",  name: "Leo",     imageUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "young",  gesture: "standing", background: "minimal", tags: ["trendy", "street"],         isCustom: false, status: "READY" },
  { id: "a7",  name: "Maya",    imageUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=500&fit=crop&crop=face", gender: "female", age: "young",  gesture: "pointing", background: "urban",   tags: ["fashion", "lifestyle"],     isCustom: false, status: "READY" },
  { id: "a8",  name: "Carlos",  imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "adult",  gesture: "holding",  background: "studio",  tags: ["model", "fitness"],         isCustom: false, status: "READY" },
  { id: "a9",  name: "Elena",   imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=500&fit=crop&crop=face", gender: "female", age: "adult",  gesture: "waving",   background: "outdoor", tags: ["travel", "wellness"],       isCustom: false, status: "READY" },
  { id: "a10", name: "Noah",    imageUrl: "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "young",  gesture: "standing", background: "urban",   tags: ["street", "casual"],         isCustom: false, status: "READY" },
  { id: "a11", name: "Priya",   imageUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=500&fit=crop&crop=face", gender: "female", age: "young",  gesture: "holding",  background: "minimal", tags: ["beauty", "lifestyle"],      isCustom: false, status: "READY" },
  { id: "a12", name: "Thomas",  imageUrl: "https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?w=400&h=500&fit=crop&crop=face", gender: "male",   age: "senior", gesture: "pointing", background: "studio",  tags: ["executive", "authority"],   isCustom: false, status: "READY" },
];

const FILTER_OPTIONS = {
  gesture:    ["all", "holding", "pointing", "waving", "standing"],
  age:        ["all", "young", "adult", "senior"],
  gender:     ["all", "female", "male", "nonbinary"],
  background: ["all", "studio", "outdoor", "urban", "minimal"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiAvatarToDisplay(a: ApiAvatar): DisplayAvatar {
  return {
    id:         a.id,
    name:       a.name,
    imageUrl:   a.image_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=00d4b8&color=000&size=400`,
    gender:     (a.gender as DisplayAvatar["gender"]) ?? "female",
    age:        (a.age    as DisplayAvatar["age"])    ?? "adult",
    gesture:    (a.gesture    as DisplayAvatar["gesture"])    ?? "standing",
    background: (a.background as DisplayAvatar["background"]) ?? "studio",
    tags:       a.tags ?? [],
    isCustom:   true,
    status:     a.status as DisplayAvatar["status"],
    badge:      "Custom Runway Model",
    progress:   a.training_progress,
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AvatarsPage() {
  const [search, setSearch]             = useState("");
  const [filters, setFilters]           = useState({ gesture: "all", age: "all", gender: "all", background: "all" });
  const [selected, setSelected]         = useState<string | null>(null);
  const [showFilters, setShowFilters]   = useState(false);
  const [trainOpen, setTrainOpen]       = useState(false);
  const [customAvatars, setCustomAvatars] = useState<DisplayAvatar[]>([]);

  // Load real avatars from backend
  useEffect(() => {
    listAvatars()
      .then((list) => setCustomAvatars(list.map(apiAvatarToDisplay)))
      .catch(() => {}); // silently skip if backend is unavailable
  }, []);

  // Poll training avatars every 8s
  useEffect(() => {
    const hasTraining = customAvatars.some((a) => a.status === "TRAINING");
    if (!hasTraining) return;
    const timer = setInterval(() => {
      listAvatars()
        .then((list) => setCustomAvatars(list.map(apiAvatarToDisplay)))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(timer);
  }, [customAvatars]);

  // Merge custom (on top) + mock
  const allAvatars: DisplayAvatar[] = [...customAvatars, ...MOCK_AVATARS];

  const filtered = allAvatars.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.tags.some((t) => t.includes(search.toLowerCase()))) return false;
    if (a.isCustom) return true; // custom avatars always shown regardless of filters
    if (filters.gesture    !== "all" && a.gesture    !== filters.gesture)    return false;
    if (filters.age        !== "all" && a.age        !== filters.age)        return false;
    if (filters.gender     !== "all" && a.gender     !== filters.gender)     return false;
    if (filters.background !== "all" && a.background !== filters.background) return false;
    return true;
  });

  function handleAvatarCreated(avatar: ApiAvatar) {
    const display = apiAvatarToDisplay(avatar);
    setCustomAvatars((prev) => [display, ...prev.filter((a) => a.id !== display.id)]);
    setTrainOpen(false);
  }

  const selectedAvatar = allAvatars.find((a) => a.id === selected);

  return (
    <div className="flex flex-col h-screen bg-tt-bg">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-tt-border bg-tt-surface/80 backdrop-blur px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-tt-text">Avatar Library</h1>
            <p className="text-xs text-tt-muted mt-0.5">{filtered.length} avatars available</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((f) => !f)}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
                showFilters ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent" : "border-tt-border bg-tt-card text-tt-muted hover:text-tt-text"
              )}
            >
              <SlidersHorizontal size={16} /> Filters
            </button>

            {/* Train New AI Creator CTA */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setTrainOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-tt-accent to-tt-blue px-5 py-2.5 text-sm font-bold text-black shadow-glow-accent hover:shadow-lg transition-all"
            >
              <Plus size={16} />
              Train New AI Creator
            </motion.button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tt-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search avatars by name or tag…"
            className="w-full rounded-xl border border-tt-border bg-tt-card pl-10 pr-4 py-2.5 text-sm text-tt-text placeholder-tt-muted focus:border-tt-accent/50 focus:outline-none focus:ring-1 focus:ring-tt-accent/30 transition-all"
          />
        </div>

        {/* Filter chips */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(FILTER_OPTIONS) as (keyof typeof FILTER_OPTIONS)[]).map((key) => (
                  <div key={key} className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-tt-muted">{key}</label>
                    <div className="flex flex-wrap gap-1">
                      {FILTER_OPTIONS[key].map((val) => (
                        <button key={val} onClick={() => setFilters((f) => ({ ...f, [key]: val }))}
                          className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize border transition-all",
                            filters[key] === val ? "border-tt-accent/50 bg-tt-accent/10 text-tt-accent" : "border-tt-border bg-tt-card text-tt-muted hover:border-tt-dim")}>
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Avatar Grid ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Custom model section (if any) */}
        {customAvatars.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-tt-accent" />
              <p className="text-xs font-bold uppercase tracking-wider text-tt-accent">Custom AI Creators</p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {customAvatars.map((avatar, i) => (
                <AvatarCard key={avatar.id} avatar={avatar} index={i} selected={selected === avatar.id}
                  onSelect={() => setSelected(selected === avatar.id ? null : avatar.id)} />
              ))}
            </div>
            <div className="mt-4 mb-2 border-b border-tt-border" />
          </div>
        )}

        {/* Library avatars */}
        {filtered.filter((a) => !a.isCustom).length === 0 && customAvatars.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-tt-muted">
            <Filter size={32} />
            <p className="text-sm font-medium">No avatars match your filters</p>
            <button onClick={() => { setFilters({ gesture: "all", age: "all", gender: "all", background: "all" }); setSearch(""); }}
              className="text-xs text-tt-accent hover:underline">
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            {customAvatars.length > 0 && filtered.filter((a) => !a.isCustom).length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-tt-muted">Library</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.filter((a) => !a.isCustom).map((avatar, i) => (
                <AvatarCard key={avatar.id} avatar={avatar} index={i} selected={selected === avatar.id}
                  onSelect={() => setSelected(selected === avatar.id ? null : avatar.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Selected avatar action bar ─────────────────────────────────────── */}
      <AnimatePresence>
        {selected && selectedAvatar && (
          <motion.div
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="border-t border-tt-border bg-tt-surface/95 backdrop-blur px-6 py-4"
          >
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selectedAvatar.imageUrl} alt={selectedAvatar.name} className="h-12 w-10 rounded-xl object-cover border border-tt-border" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-tt-text">{selectedAvatar.name} selected</p>
                  {selectedAvatar.isCustom && (
                    <span className="rounded-full border border-tt-accent/30 bg-tt-accent/10 px-2 py-0.5 text-[10px] font-bold text-tt-accent">Custom Runway</span>
                  )}
                </div>
                <p className="text-xs text-tt-muted capitalize">{selectedAvatar.gesture} · {selectedAvatar.background} · {selectedAvatar.age}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg border border-tt-border px-4 py-2 text-xs font-semibold text-tt-muted hover:text-tt-text transition-colors">
                Cancel
              </button>
              <a href="/" className="btn-accent flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold">
                <Play size={14} /> Use in Video
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Train Modal */}
      <TrainCreatorModal
        open={trainOpen}
        onClose={() => setTrainOpen(false)}
        onCreated={handleAvatarCreated}
      />
    </div>
  );
}

// ── AvatarCard sub-component ──────────────────────────────────────────────────

function AvatarCard({
  avatar,
  index,
  selected,
  onSelect,
}: {
  avatar:   DisplayAvatar;
  index:    number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={avatar.status === "READY" ? onSelect : undefined}
      className={clsx(
        "group relative overflow-hidden rounded-2xl border-2 transition-all duration-200",
        avatar.status === "TRAINING" ? "border-tt-accent/30 cursor-default" :
        avatar.status === "FAILED"   ? "border-red-500/30 cursor-default" :
        selected ? "border-tt-accent shadow-glow-accent cursor-pointer" :
        "border-tt-border hover:border-tt-accent/50 hover:shadow-card-hover cursor-pointer"
      )}
    >
      {/* Avatar image */}
      <div className="aspect-[3/4] overflow-hidden bg-tt-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.imageUrl}
          alt={avatar.name}
          className={clsx("h-full w-full object-cover transition-transform duration-500",
            avatar.status === "READY" ? "group-hover:scale-105" : "opacity-60")}
        />
      </div>

      {/* Training overlay */}
      {avatar.status === "TRAINING" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-tt-accent border-t-transparent" />
            <span className="text-xs font-bold text-tt-accent">Training…</span>
          </div>
          {avatar.progress !== undefined && avatar.progress > 0 && (
            <div className="w-3/4 space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-tt-border">
                <motion.div
                  animate={{ width: `${avatar.progress}%` }}
                  className="h-full rounded-full bg-tt-accent"
                />
              </div>
              <p className="text-center text-[10px] text-tt-accent font-semibold">{avatar.progress}%</p>
            </div>
          )}
        </div>
      )}

      {/* Hover overlay (only for ready) */}
      {avatar.status === "READY" && (
        <div className="absolute inset-0 image-card-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 gap-2">
          <div className="flex gap-1.5">
            <button className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-tt-accent/90 py-2 text-xs font-bold text-black hover:bg-tt-accent transition-all">
              <Play size={12} /> Preview
            </button>
            {selected ? (
              <button className="flex h-8 w-8 items-center justify-center rounded-xl bg-tt-accent text-black"><Check size={14} /></button>
            ) : (
              <button className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"><Check size={14} /></button>
            )}
          </div>
        </div>
      )}

      {/* Selected badge */}
      {selected && avatar.status === "READY" && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-tt-accent shadow-glow-accent">
          <Check size={12} className="text-black" />
        </div>
      )}

      {/* Custom model badge */}
      {avatar.isCustom && avatar.status === "READY" && (
        <div className="absolute left-2 top-2">
          <span className="flex items-center gap-1 rounded-full border border-tt-accent/40 bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[9px] font-bold text-tt-accent">
            <Zap size={8} /> Custom
          </span>
        </div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
        <p className="text-xs font-bold text-white">{avatar.name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {avatar.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white/80 capitalize">{tag}</span>
          ))}
          {avatar.status === "TRAINING" && (
            <span className="flex items-center gap-0.5 rounded-full bg-tt-accent/30 px-1.5 py-0.5 text-[9px] font-semibold text-tt-accent">
              <Clock size={8} /> Training
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
