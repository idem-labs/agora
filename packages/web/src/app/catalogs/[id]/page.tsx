import { getCatalogs, getCatalogById, getCatalogScores } from "@/lib/data";
import { COUNTRY_FLAGS, DIMENSION_LABELS, DIMENSION_ICONS, pct } from "@/lib/scores";
import { ScoreCircle, DimensionCard } from "@/components/score-badge";
import { StatCard } from "@/components/stat-card";
import { DatasetList } from "./dataset-list";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const catalogs = await getCatalogs();
  return catalogs.filter((c) => c.status !== "pending").map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const catalog = await getCatalogById(id);
  return {
    title: catalog ? catalog.name : "Catalog",
    description: catalog
      ? `Quality analysis of ${catalog.name}: ${catalog.datasetCount} datasets scored.`
      : undefined,
  };
}

export default async function CatalogPage({ params }: Props) {
  const { id } = await params;
  const catalog = await getCatalogById(id);

  if (!catalog) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Catalog not found</h1>
        <a href="/ranking" className="mt-4 text-brand-600 hover:underline">
          Back to ranking
        </a>
      </div>
    );
  }

  const scores = await getCatalogScores(id);
  const dims = ["accessibility", "structure", "freshness", "completeness"] as const;
  const flag = COUNTRY_FLAGS[catalog.country] || "🌐";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-slate-500">
        <a href="/ranking" className="hover:text-brand-600">
          Ranking
        </a>
        <span className="mx-2">/</span>
        <span className="text-slate-900">{catalog.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{flag}</span>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{catalog.name}</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {catalog.protocol.toUpperCase()} &middot;{" "}
                <a
                  href={catalog.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  {catalog.url}
                </a>
              </p>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0">
          <ScoreCircle score={catalog.scores.overall} size={80} label="Overall" />
        </div>
      </div>

      {/* Coverage indicator */}
      {catalog.coverage != null && catalog.coverage > 0 && catalog.coverage < 1 && (
        <div className="mt-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-amber-800">
                Scoring in progress: {catalog.datasetsScored?.toLocaleString() ?? 0} of {catalog.datasetCount.toLocaleString()} datasets ({Math.round(catalog.coverage * 100)}%)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.round(catalog.coverage * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Datasets"
          value={catalog.datasetCount}
          sub={catalog.coverage === 0 && catalog.datasetCount > 0 ? "partial sweep" : undefined}
        />
        <StatCard
          label="Resources"
          value={catalog.resourceCount}
        />
        <StatCard
          label="Accessible"
          value={pct(catalog.stats.accessiblePct)}
          sub="of resources reachable"
        />
        <StatCard
          label="Median freshness"
          value={
            catalog.stats.medianFreshnessDays != null
              ? `${catalog.stats.medianFreshnessDays}d`
              : "N/A"
          }
          sub="since last update"
        />
      </div>

      {/* Dimensions */}
      <h2 className="mt-10 text-lg font-semibold text-slate-900">Quality dimensions</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dims.map((d) => (
          <DimensionCard
            key={d}
            dimension={DIMENSION_LABELS[d]}
            score={catalog.scores[d]}
            icon={DIMENSION_ICONS[d]}
          />
        ))}
      </div>

      {/* Top formats */}
      <h2 className="mt-10 text-lg font-semibold text-slate-900">Top formats</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {catalog.stats.topFormats.map((f) => (
          <span
            key={f.format}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
          >
            {f.format}
            <span className="text-xs text-slate-400">{f.count.toLocaleString()}</span>
          </span>
        ))}
      </div>

      {/* Datasets */}
      <h2 className="mt-10 text-lg font-semibold text-slate-900">
        Datasets
        <span className="ml-2 text-sm font-normal text-slate-400">
          {scores.datasets.length > 0
            ? scores.datasets.length.toLocaleString()
            : scores.datasetCount.toLocaleString()}
        </span>
      </h2>
      {scores.datasets.length > 0 ? (
        <DatasetList datasets={scores.datasets} />
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <p className="text-sm text-slate-500">
            Individual dataset scores are not available for this catalog.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Large catalogs are scored in aggregate. Catalog-level scores are shown above.
          </p>
        </div>
      )}
    </div>
  );
}
