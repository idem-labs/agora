import { getCatalogs, getGlobalStats } from "@/lib/data";
import { pct, COUNTRY_FLAGS } from "@/lib/scores";
import { ScoreBadge, ScoreBar } from "@/components/score-badge";
import { StatCard } from "@/components/stat-card";

export default async function Home() {
  const [stats, catalogs] = await Promise.all([getGlobalStats(), getCatalogs()]);
  const topCatalogs = catalogs.filter((c) => c.status !== "pending").sort((a, b) => b.scores.overall - a.scores.overall).slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Open Data Intelligence
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-200">
            Automated quality analysis of government open data portals. We measure
            accessibility, structure, freshness, and completeness so you can find
            the data that actually works.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="/ranking"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50"
            >
              View ranking
            </a>
            <a
              href="https://github.com/idemfede/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand-400 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-4 -mt-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Catalogs" value={stats.catalogCount} sub="government portals" />
          <StatCard label="Datasets" value={stats.totalDatasets} sub="indexed" />
          <StatCard label="Resources" value={stats.totalResources} sub="files & APIs" />
          <StatCard
            label="Avg. Quality"
            value={pct(stats.avgOverall)}
            sub={`${pct(stats.avgAccessibility)} accessible`}
          />
        </div>
      </section>

      {/* Top Catalogs */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Top portals</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ranked by overall quality score
            </p>
          </div>
          <a
            href="/ranking"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all &rarr;
          </a>
        </div>

        <div className="mt-6 space-y-3">
          {topCatalogs.map((cat, i) => (
            <a
              key={cat.id}
              href={`/catalogs/${cat.id}`}
              className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                {i + 1}
              </span>
              <span className="text-lg">
                {COUNTRY_FLAGS[cat.country] || "🌐"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{cat.name}</p>
                <p className="text-xs text-slate-500">
                  {cat.datasetCount.toLocaleString()} datasets &middot;{" "}
                  {cat.protocol.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden w-32 sm:block">
                  <ScoreBar score={cat.scores.overall} />
                </div>
                <ScoreBadge score={cat.scores.overall} />
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            Four dimensions of quality
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <DimensionExplainer
              icon="🔗"
              title="Accessibility"
              desc="Can the data actually be downloaded? We check every resource URL for broken links and server errors."
            />
            <DimensionExplainer
              icon="📊"
              title="Structure"
              desc="Is the data in a machine-readable format? CSVs and APIs score high; PDFs and scanned documents score low."
            />
            <DimensionExplainer
              icon="🕐"
              title="Freshness"
              desc="When was the data last updated? Scores decay over time using exponential half-life."
            />
            <DimensionExplainer
              icon="📋"
              title="Completeness"
              desc="Are metadata fields filled in? Title, description, organization, tags, and license all matter."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function DimensionExplainer({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="text-center">
      <span className="text-3xl">{icon}</span>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc}</p>
    </div>
  );
}
