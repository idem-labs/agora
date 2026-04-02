"use client";

import { Fragment, useState, useMemo } from "react";
import type { CatalogSummary } from "@agora/sdk";
import { COUNTRY_FLAGS, COUNTRY_NAMES, pct } from "@/lib/scores";
import { ScoreBadge, ScoreBar } from "@/components/score-badge";

type SortKey = "weighted" | "overall" | "accessibility" | "structure" | "freshness" | "completeness" | "datasets" | "name";
type SortDir = "asc" | "desc";

interface CountryGroup {
  country: string;
  catalogs: CatalogSummary[];
  totalDatasets: number;
  scoredCount: number;
}

const weighted = (c: CatalogSummary) =>
  c.scores.overall * Math.log10(1 + c.datasetCount);

export function RankingTable({ catalogs }: { catalogs: CatalogSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("weighted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const isPending = (c: CatalogSummary) => c.status === "pending";

  const groups = useMemo((): CountryGroup[] => {
    const compareCatalogs = (a: CatalogSummary, b: CatalogSummary): number => {
      if (isPending(a) !== isPending(b)) return isPending(a) ? 1 : -1;

      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case "weighted":
          va = weighted(a);
          vb = weighted(b);
          break;
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
    };

    const groupMap = new Map<string, CatalogSummary[]>();
    for (const cat of catalogs) {
      const list = groupMap.get(cat.country) || [];
      list.push(cat);
      groupMap.set(cat.country, list);
    }

    return Array.from(groupMap.entries())
      .map(([country, cats]) => ({
        country,
        catalogs: [...cats].sort(compareCatalogs),
        totalDatasets: cats.reduce((s, c) => s + c.datasetCount, 0),
        scoredCount: cats.filter((c) => !isPending(c)).length,
      }))
      .sort((a, b) => {
        if (a.scoredCount !== b.scoredCount) return b.scoredCount - a.scoredCount;
        return b.totalDatasets - a.totalDatasets;
      });
  }, [catalogs, sortKey, sortDir]);

  let rank = 0;

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="border-b border-slate-100">
          <tr>
            <th
              className="w-10 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 transition hover:text-slate-900"
              onClick={() => { setSortKey("weighted"); setSortDir("desc"); }}
              title="Sort by relevance (quality weighted by catalog size)"
            >
              <span className="inline-flex items-center gap-1">
                #
                {sortKey === "weighted" && (
                  <span className="text-brand-600">{sortDir === "desc" ? "↓" : "↑"}</span>
                )}
              </span>
            </th>
            <SortHeader label="Catalog" sortKeyVal="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader label="Datasets" sortKeyVal="datasets" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="text-right" />
            <SortHeader label="Quality" sortKeyVal="overall" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
            <SortHeader label="🔗 Access." sortKeyVal="accessibility" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="📊 Struct." sortKeyVal="structure" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="🕐 Fresh." sortKeyVal="freshness" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
            <SortHeader label="📋 Compl." sortKeyVal="completeness" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((group) => (
            <Fragment key={group.country}>
              <tr className="bg-slate-50/80">
                <td colSpan={99} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{COUNTRY_FLAGS[group.country] || "🌐"}</span>
                    <span className="font-semibold text-slate-900">
                      {COUNTRY_NAMES[group.country] || group.country}
                    </span>
                    <span className="text-xs text-slate-500">
                      {group.scoredCount} {group.scoredCount === 1 ? "portal" : "portals"} &middot;{" "}
                      {group.totalDatasets.toLocaleString()} datasets
                    </span>
                  </div>
                </td>
              </tr>
              {group.catalogs.map((cat) => {
                const pending = isPending(cat);
                if (!pending) rank++;
                return (
                  <tr
                    key={cat.id}
                    className={`transition hover:bg-slate-50 ${pending ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-3 font-medium text-slate-400">
                      {pending ? "—" : rank}
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={pending ? undefined : `/catalogs/${cat.id}`}
                        className={`group flex items-center gap-2 ${pending ? "pointer-events-none" : ""}`}
                      >
                        <div>
                          <span
                            className={`font-medium ${pending ? "text-slate-500" : "text-slate-900 group-hover:text-brand-700"}`}
                          >
                            {cat.name}
                          </span>
                          <span className="ml-2 text-xs text-slate-400">
                            {cat.protocol.toUpperCase()}
                          </span>
                          {pending && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              pending
                            </span>
                          )}
                          {!pending && cat.tier === "aggregate" && (
                            <span
                              title="Scored in aggregate — individual dataset scores not available"
                              className="ml-1.5 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-400"
                            >
                              i
                            </span>
                          )}
                        </div>
                      </a>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {pending || (cat.coverage === 0 && cat.datasetCount > 0) ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <>
                          <span>{cat.datasetCount.toLocaleString()}</span>
                          {cat.coverage != null && cat.coverage > 0 && cat.coverage < 1 && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              {Math.round(cat.coverage * 100)}%
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {pending ? (
                        <span className="text-xs text-slate-400">Not scored</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <ScoreBar score={cat.scores.overall} />
                          </div>
                          <ScoreBadge score={cat.scores.overall} size="sm" />
                        </div>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {pending ? null : <MiniScore score={cat.scores.accessibility} />}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {pending ? null : <MiniScore score={cat.scores.structure} />}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {pending ? null : <MiniScore score={cat.scores.freshness} />}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {pending ? null : <MiniScore score={cat.scores.completeness} />}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
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
