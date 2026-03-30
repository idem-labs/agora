import { getCatalogs, getGlobalStats } from "@/lib/data";
import { pct, COUNTRY_FLAGS } from "@/lib/scores";
import { ScoreBadge, ScoreBar } from "@/components/score-badge";
import { StatCard } from "@/components/stat-card";

export default async function Home() {
  const [stats, catalogs] = await Promise.all([getGlobalStats(), getCatalogs()]);
  const scored = catalogs.filter((c) => c.status !== "pending");
  const topCatalogs = scored
    .sort((a, b) => {
      const wa = a.scores.overall * Math.log10(1 + a.datasetCount);
      const wb = b.scores.overall * Math.log10(1 + b.datasetCount);
      return wb - wa;
    })
    .slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <span className="inline-flex items-center rounded-full border border-brand-400/30 bg-brand-800/50 px-3 py-1 text-xs font-medium text-brand-200">
            Open Source &middot; MIT License
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Open Data Intelligence
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-brand-200">
            Government portals publish thousands of datasets&thinsp;&mdash;&thinsp;but
            which ones actually work? Agora scores every dataset for quality, so you
            can find data that&apos;s reliable.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="/ranking"
              className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50"
            >
              View ranking
            </a>
            <a
              href="https://github.com/idemfede/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand-400/50 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-4 -mt-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Catalogs"
            value={stats.catalogCount}
            sub={`${stats.countryCount} countries`}
          />
          <StatCard label="Datasets" value={stats.totalDatasets} sub="scored" />
          <StatCard label="Resources" value={stats.totalResources} sub="files & APIs" />
          <StatCard
            label="Avg. Quality"
            value={pct(stats.avgOverall)}
            sub={`${pct(stats.avgAccessibility)} accessible`}
          />
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            The problem with open data
          </h2>
          <p className="mt-4 text-center leading-relaxed text-slate-600">
            Governments publish open data, but there&apos;s no standard for quality.
            Broken links, outdated files, PDFs instead of CSVs, missing
            metadata&thinsp;&mdash;&thinsp;these problems make data unreliable.
            Without quality signals, finding usable datasets is guesswork.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            How Agora solves it
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              title="MCP Server for AI"
              desc="Give your LLM access to quality-scored open data catalogs worldwide. Hybrid search (vector + full-text) across CKAN, Socrata, and DCAT portals in one tool call."
            />
            <FeatureCard
              title="Automated Quality Scoring"
              desc="Four dimensions measured automatically: accessibility, structure, freshness, and completeness. No manual review needed."
            />
            <FeatureCard
              title="Incremental Updates"
              desc="Only changed datasets are re-evaluated. Quality signals stay fresh with minimal compute cost, running as a GitHub Action."
            />
            <FeatureCard
              title="Multi-language Search"
              desc="Language-aware search with per-language stemming, synonyms, and acronym expansion. Find data in Spanish, English, Portuguese, and more."
            />
            <FeatureCard
              title="42 Portals, 13 Countries"
              desc="From Argentina to Switzerland, the MCP catalog directory covers government data portals across Latin America, Europe, and North America."
            />
            <FeatureCard
              title="Zero Hosting Cost"
              desc="Static-first architecture. The scoring pipeline runs as a GitHub Action, outputs are served via CDN. No servers, no databases."
            />
          </div>
        </div>
      </section>

      {/* Top Catalogs */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Top portals</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ranked by quality score weighted by catalog size
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
                  {cat.resourceCount.toLocaleString()} resources &middot;{" "}
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

      {/* Four dimensions */}
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
              desc="When was the data last updated? Scores decay over time using an exponential half-life model."
            />
            <DimensionExplainer
              icon="📋"
              title="Completeness"
              desc="Are metadata fields filled in? Title, description, organization, tags, and license all matter."
            />
          </div>
        </div>
      </section>

      {/* Open source CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-2xl bg-gradient-to-br from-brand-950 to-brand-900 p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold text-white">Built in the open</h2>
          <p className="mx-auto mt-4 max-w-xl text-brand-200">
            Agora is fully open source. The MCP server, quality scoring pipeline,
            and this dashboard are MIT licensed. Star us on GitHub or install the
            MCP server to give your AI tools access to quality-scored open data.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="/ranking"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
            >
              Explore ranking
            </a>
            <a
              href="https://github.com/idemfede/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand-400/50 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
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
