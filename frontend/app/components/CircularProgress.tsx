"use client";

interface CircularProgressProps {
  value: number;   // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
}

export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 5,
  color = "#00d4b8",
  trackColor = "#1e1e30",
  label,
}: CircularProgressProps) {
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="progress-ring-circle"
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      {/* Center text */}
      <div className="flex flex-col items-center justify-center">
        {label ? (
          <span className="text-xs font-bold" style={{ color }}>{label}</span>
        ) : (
          <span className="text-sm font-bold text-white">{Math.round(value)}%</span>
        )}
      </div>
    </div>
  );
}
