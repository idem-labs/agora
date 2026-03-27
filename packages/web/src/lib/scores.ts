/** Score color and label utilities. */

export type ScoreLevel = "excellent" | "good" | "fair" | "poor" | "critical";

export function scoreLevel(score: number): ScoreLevel {
  if (score >= 0.8) return "excellent";
  if (score >= 0.6) return "good";
  if (score >= 0.4) return "fair";
  if (score >= 0.2) return "poor";
  return "critical";
}

export function scoreColor(score: number): string {
  const level = scoreLevel(score);
  const colors: Record<ScoreLevel, string> = {
    excellent: "#10b981", // emerald-500
    good: "#3b82f6",      // blue-500
    fair: "#f59e0b",      // amber-500
    poor: "#f97316",      // orange-500
    critical: "#ef4444",  // red-500
  };
  return colors[level];
}

export function scoreBg(score: number): string {
  const level = scoreLevel(score);
  const bgs: Record<ScoreLevel, string> = {
    excellent: "bg-emerald-500",
    good: "bg-blue-500",
    fair: "bg-amber-500",
    poor: "bg-orange-500",
    critical: "bg-red-500",
  };
  return bgs[level];
}

export function scoreBgLight(score: number): string {
  const level = scoreLevel(score);
  const bgs: Record<ScoreLevel, string> = {
    excellent: "bg-emerald-50",
    good: "bg-blue-50",
    fair: "bg-amber-50",
    poor: "bg-orange-50",
    critical: "bg-red-50",
  };
  return bgs[level];
}

export function scoreTextColor(score: number): string {
  const level = scoreLevel(score);
  const colors: Record<ScoreLevel, string> = {
    excellent: "text-emerald-700",
    good: "text-blue-700",
    fair: "text-amber-700",
    poor: "text-orange-700",
    critical: "text-red-700",
  };
  return colors[level];
}

export function scoreLabel(score: number): string {
  const level = scoreLevel(score);
  const labels: Record<ScoreLevel, string> = {
    excellent: "Excellent",
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    critical: "Critical",
  };
  return labels[level];
}

export function pct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export const DIMENSION_LABELS: Record<string, string> = {
  accessibility: "Accessibility",
  structure: "Structure",
  freshness: "Freshness",
  completeness: "Completeness",
  usability: "Usability",
};

export const DIMENSION_ICONS: Record<string, string> = {
  accessibility: "🔗",
  structure: "📊",
  freshness: "🕐",
  completeness: "📋",
};

export const COUNTRY_FLAGS: Record<string, string> = {
  AR: "🇦🇷",
  CL: "🇨🇱",
  UY: "🇺🇾",
  MX: "🇲🇽",
  CO: "🇨🇴",
  DO: "🇩🇴",
  CR: "🇨🇷",
  US: "🇺🇸",
  GB: "🇬🇧",
  CA: "🇨🇦",
  IE: "🇮🇪",
  IT: "🇮🇹",
  CH: "🇨🇭",
};
