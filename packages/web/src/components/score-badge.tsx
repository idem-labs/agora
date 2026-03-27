import { pct, scoreBg, scoreBgLight, scoreTextColor, scoreColor } from "@/lib/scores";

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-0.5",
    lg: "text-base px-3 py-1 font-semibold",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${scoreBgLight(score)} ${scoreTextColor(score)} ${sizeClasses[size]}`}
    >
      {pct(score)}
    </span>
  );
}

export function ScoreCircle({ score, size = 48, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-sm font-semibold ${scoreTextColor(score)}`}>
        {pct(score)}
      </span>
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </div>
  );
}

export function ScoreBar({ score, className = "" }: { score: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${scoreBg(score)}`}
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  );
}

export function DimensionCard({
  dimension,
  score,
  icon,
}: {
  dimension: string;
  score: number;
  icon: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">
          {icon} {dimension}
        </span>
        <ScoreBadge score={score} size="sm" />
      </div>
      <ScoreBar score={score} />
    </div>
  );
}
