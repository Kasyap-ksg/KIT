import { Shield, AlertTriangle, CheckCircle2 } from "lucide-react";

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | string;

interface RiskGaugeProps {
  score: number;
  band: RiskBand;
  size?: number;
  showLabel?: boolean;
}

export function bandColor(band: RiskBand): string {
  if (band === "HIGH") return "hsl(0 60% 50%)";
  if (band === "MEDIUM") return "hsl(36 80% 45%)";
  return "hsl(150 55% 38%)";
}

export function bandTextClass(band: RiskBand): string {
  if (band === "HIGH") return "text-red-700 dark:text-red-400";
  if (band === "MEDIUM") return "text-amber-700 dark:text-amber-400";
  return "text-emerald-700 dark:text-emerald-400";
}

export function bandBgClass(band: RiskBand): string {
  if (band === "HIGH") return "bg-red-50 dark:bg-red-950/30 border-red-200/70 dark:border-red-900/60";
  if (band === "MEDIUM") return "bg-amber-50 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-900/60";
  return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-900/60";
}

export function BandIcon({ band, className }: { band: RiskBand; className?: string }) {
  if (band === "HIGH") return <AlertTriangle className={className} />;
  if (band === "MEDIUM") return <Shield className={className} />;
  return <CheckCircle2 className={className} />;
}

export function RiskGauge({ score, band, size = 120, showLabel = true }: RiskGaugeProps) {
  const stroke = Math.max(8, Math.round(size * 0.08));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = bandColor(band);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="font-bold tabular-nums leading-none"
          style={{ fontSize: Math.round(size * 0.32), color }}
          data-testid="text-risk-score"
        >
          {clamped}
        </div>
        {showLabel && (
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-1 font-semibold">
            Risk / 100
          </div>
        )}
      </div>
    </div>
  );
}
