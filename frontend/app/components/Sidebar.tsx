"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Film, Users, Library, Sparkles, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  {
    href: "/",
    icon: Film,
    label: "Video Generation",
    description: "Create AI videos",
  },
  {
    href: "/avatars",
    icon: Users,
    label: "Avatars",
    description: "Browse avatar library",
  },
  {
    href: "/library",
    icon: Library,
    label: "Library",
    description: "My generations",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-tt-border bg-tt-surface">
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-tt-accent via-tt-blue to-tt-purple shadow-glow-accent">
          <Film className="h-4.5 w-4.5 text-black" size={18} />
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-tt-accent/20 to-tt-purple/20 blur-sm" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-tt-text">Video Brand</p>
          <p className="text-xs font-medium text-tt-accent">Generator</p>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 px-3">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-tt-muted">
          Main Menu
        </p>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className={clsx(
                  "sidebar-link group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all duration-200",
                  active
                    ? "active bg-tt-card text-tt-text"
                    : "text-tt-muted hover:bg-tt-hover hover:text-tt-text"
                )}
              >
                <div
                  className={clsx(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                    active
                      ? "bg-gradient-to-br from-tt-accent/20 to-tt-blue/20 text-tt-accent"
                      : "bg-tt-border/50 text-tt-muted group-hover:bg-tt-border group-hover:text-tt-text"
                  )}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={clsx("font-medium leading-tight", active ? "text-tt-text" : "")}>{item.label}</p>
                  <p className="text-[11px] leading-tight text-tt-muted">{item.description}</p>
                </div>
                {active && (
                  <motion.div
                    layoutId="active-indicator"
                    className="h-2 w-2 rounded-full bg-tt-accent shadow-glow-accent"
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom badge ─────────────────────────────────────────────────── */}
      <div className="m-3 rounded-xl border border-tt-accent/20 bg-gradient-to-br from-tt-accent/5 to-tt-blue/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-tt-accent" />
          <span className="text-xs font-semibold text-tt-accent">AI Powered</span>
        </div>
        <p className="text-[11px] leading-relaxed text-tt-muted">
          Runway Gen-4 Turbo · Gemini · Imagen
        </p>
        <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-tt-accent/10 px-3 py-2 text-[11px] font-semibold text-tt-accent hover:bg-tt-accent/20 transition-colors">
          View Docs <ChevronRight size={12} />
        </button>
      </div>
    </aside>
  );
}
