"use client";

import { useState, useMemo } from "react";
import type { QualityScore, DimensionScore } from "@agora/sdk";
import { pct, scoreTextColor, DIMENSION_ICONS, DIMENSION_LABELS } from "@/lib/scores";
import { ScoreBadge, ScoreBar } from "@/components/score-badge";

const PAGE_SIZE = 20;

type SortKey = "overall" | "title" | "organization";

export function DatasetList({ datasets }: { datasets: QualityScore[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return datasets;
    return datasets.filter(
      (d) =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.organization && d.organization.toLowerCase().includes(q)) ||
        d.datasetId.toLowerCase().includes(q),
    );
  }, [datasets, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortKey) {
        case "title":
          va = a.title || a.datasetId;
          vb = b.title || b.datasetId;
          break;
        case "organization":
          va = a.organization || "";
          vb = b.organization || "";
          break;
        default:
          va = a.overall;
          vb = b.overall;
      }
      if (va < vb) return sortDir === "desc" ? 1 : -1;
      if (va > vb) return sortDir === "desc" ? -1 : 1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir(key === "overall" ? "desc" : "asc");
    }
    setPage(0);
  }

  return (
    <div className="mt-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search datasets..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 sm:max-w-sm"
      />

      {/* Sort tabs */}
      <div className="mt-3 flex gap-1 text-xs">
        {(["overall", "title", "organization"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className={`rounded-md px-2.5 py-1 transition ${
              sortKey === key
                ? "bg-brand-100 font-medium text-brand-700"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {key === "overall" ? "Score" : key === "title" ? "Name" : "Organization"}
            {sortKey === key && (
              <span className="ml-0.5">{sortDir === "desc" ? "↓" : "↑"}</span>
            )}
          </button>
        ))}
        <span className="ml-auto self-center text-slate-400">
          {filtered.length} of {datasets.length}
        </span>
      </div>

      {/* List */}
      <div className="mt-3 space-y-1">
        {paged.map((ds) => (
          <div key={ds.datasetId}>
            <button
              onClick={() => setExpandedId(expandedId === ds.datasetId ? null : ds.datasetId)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-200 hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">
                  {ds.title || ds.datasetId}
                </p>
                {ds.organization && (
                  <p className="truncate text-xs text-slate-500">{ds.organization}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden w-20 sm:block">
                  <ScoreBar score={ds.overall} />
                </div>
                <ScoreBadge score={ds.overall} size="sm" />
                <svg
                  className={`h-4 w-4 text-slate-400 transition ${expandedId === ds.datasetId ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded detail */}
            {expandedId === ds.datasetId && (
              <div className="mb-2 ml-4 mt-1 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ds.dimensions.map((dim) => (
                    <DimensionMini key={dim.dimension} dim={dim} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Last checked: {new Date(ds.lastChecked).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function DimensionMini({ dim }: { dim: DimensionScore }) {
  const icon = DIMENSION_ICONS[dim.dimension] || "";
  const label = DIMENSION_LABELS[dim.dimension] || dim.dimension;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600">{label}</span>
          <span className={`text-xs font-medium ${scoreTextColor(dim.score)}`}>
            {pct(dim.score)}
          </span>
        </div>
        <ScoreBar score={dim.score} className="mt-1" />
      </div>
    </div>
  );
}
