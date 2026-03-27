"use client";

import { useState } from "react";
import type { CatalogSummary } from "@agora/sdk";
import { COUNTRY_FLAGS, pct } from "@/lib/scores";
import { ScoreBadge, ScoreBar } from "@/components/score-badge";

type SortKey = "overall" | "accessibility" | "structure" | "freshness" | "completeness" | "datasets" | "name";
type SortDir = "asc" | "desc";

export function RankingTable({ catalogs }: { catalogs: CatalogSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...catalogs].sort((a, b) => {
    let va: number | string;
    let vb: number | string;
    switch (sortKey) {
      case "name":
        va = a.name;
        vb = b.name;
        break;
      case "datasets":
        va = a.datasetCount;
        vb = b.datasetCount;
        break;
      default:
        va = a.scores[sortKey];
        vb = b.scores[sortKey];
    }
    if (va < vb) return sortDir === "desc" ? 1 : -1;
    if (va > vb) return sortDir === "desc" ? -1 : 1;
    return 0;
  });

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="border-b border-slate-100">
          <tr>
            <th className="w-10 px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              #
            </th>
            <SortHeader label="Catalog" sortKeyVal="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader label="Datasets" sortKeyVal="datasets" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="text-right" />
            <SortHeader label="Overall" sortKeyVal="overall" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader label="🔗 Access." sortKeyVal="accessibility" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="📊 Struct." sortKeyVal="structure" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="🕐 Fresh." sortKeyVal="freshness" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="📋 Compl." sortKeyVal="completeness" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((cat, i) => (
            <tr key={cat.id} className="transition hover:bg-slate-50">
              <td className="px-3 py-3 font-medium text-slate-400">{i + 1}</td>
              <td className="px-3 py-3">
                <a href={`/catalogs/${cat.id}`} className="group flex items-center gap-2">
                  <span className="text-base">{COUNTRY_FLAGS[cat.country] || "🌐"}</span>
                  <div>
                    <span className="font-medium text-slate-900 group-hover:text-brand-700">
                      {cat.name}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      {cat.protocol.toUpperCase()}
                    </span>
                  </div>
                </a>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                {cat.datasetCount.toLocaleString()}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <ScoreBar score={cat.scores.overall} />
                  </div>
                  <ScoreBadge score={cat.scores.overall} size="sm" />
                </div>
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <MiniScore score={cat.scores.accessibility} />
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <MiniScore score={cat.scores.structure} />
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <MiniScore score={cat.scores.freshness} />
              </td>
              <td className="hidden px-3 py-3 lg:table-cell">
                <MiniScore score={cat.scores.completeness} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  sortKeyVal,
  sortKey,
  sortDir,
  onToggle,
  className = "",
}: {
  label: string;
  sortKeyVal: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
  className?: string;
}) {
  return (
    <th
      className={`cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 transition hover:text-slate-900 ${className}`}
      onClick={() => onToggle(sortKeyVal)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyVal && (
          <span className="text-brand-600">{sortDir === "desc" ? "↓" : "↑"}</span>
        )}
      </span>
    </th>
  );
}

function MiniScore({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12">
        <ScoreBar score={score} />
      </div>
      <span className="tabular-nums text-xs text-slate-500">{pct(score)}</span>
    </div>
  );
}
