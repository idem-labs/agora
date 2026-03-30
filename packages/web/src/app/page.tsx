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
            MCP Server &middot; Open Source
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Government open data
            <br className="hidden sm:block" />
            {" "}for your AI
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-brand-200">
            An MCP server that connects any LLM to 42 government data portals
            across 13 countries. Search datasets, run SQL on remote CSVs,
            and filter by quality score&thinsp;&mdash;&thinsp;all through one tool call.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/idemfede/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50"
            >
              Get started
            </a>
            <a
              href="/ranking"
              className="rounded-lg border border-brand-400/50 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Quality ranking
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-4 -mt-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Portals"
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

      {/* What you can do */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-slate-900">
          What your AI can do with Agora
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <CapabilityCard
            title="Search across catalogs"
            desc="Hybrid search combining vector embeddings and full-text across CKAN, Socrata, and DCAT portals. Language-aware stemming, synonyms, and acronym expansion in Spanish, English, Portuguese, and more."
            detail="search_datasets"
          />
          <CapabilityCard
            title="SQL on remote CSVs"
            desc="Run analytical queries on any remote CSV without downloading it. Powered by DuckDB with automatic type inference, multi-table joins, and session persistence."
            detail="query_sql"
          />
          <CapabilityCard
            title="Quality-scored results"
            desc="Every dataset is scored across four dimensions: accessibility, structure, freshness, and completeness. Your AI knows which data is reliable before using it."
            detail="inspect_dataset"
          />
          <CapabilityCard
            title="Economic time series"
            desc="Query economic indicators directly. CPI, GDP, exchange rates, employment, poverty — from Argentina&apos;s API, with FRED and Eurostat coming next."
            detail="query_series"
          />
        </div>
      </section>

      {/* Quality scoring */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold text-slate-900">
              The quality problem, solved
            </h2>
            <p className="mt-4 leading-relaxed text-slate-600">
              Government portals publish thousands of datasets, but there&apos;s no
              standard for quality. Broken links, outdated files, PDFs instead of
              CSVs, missing metadata. Agora&apos;s scoring pipeline evaluates every
              dataset automatically and updates incrementally&thinsp;&mdash;&thinsp;so
              quality signals stay fresh with zero manual review.
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <DimensionCard
              icon="🔗"
              title="Accessibility"
              desc="Can the data actually be downloaded? We check every resource URL for broken links and server errors."
            />
            <DimensionCard
              icon="📊"
              title="Structure"
              desc="Is the data in a machine-readable format? CSVs and APIs score high; PDFs and scanned documents score low."
            />
            <DimensionCard
              icon="🕐"
              title="Freshness"
              desc="When was the data last updated? Scores decay over time using an exponential half-life model."
            />
            <DimensionCard
              icon="📋"
              title="Completeness"
              desc="Are metadata fields filled in? Title, description, organization, tags, and license all matter."
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

      {/* Architecture */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            How it all fits together
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <FeatureCard
              title="MCP Server"
              desc="TypeScript server implementing the Model Context Protocol. Connects to any LLM client — Claude, GPT, local models. Hybrid search with vector embeddings + DuckDB full-text."
            />
            <FeatureCard
              title="Scoring Pipeline"
              desc="GitHub Action that evaluates every dataset across four quality dimensions. Runs incrementally — only changed datasets are re-scored. Outputs static JSON, served via CDN."
            />
            <FeatureCard
              title="42 Portals, 13 Countries"
              desc="Built-in catalog directory covering Latin America, Europe, and North America. CKAN, Socrata, and DCAT protocols. Language-aware search per catalog."
            />
          </div>
        </div>
      </section>

      {/* Open source CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-2xl bg-gradient-to-br from-brand-950 to-brand-900 p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold text-white">
            Open source, MIT licensed
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-brand-200">
            The MCP server, quality scoring pipeline, and this dashboard are all
            open source. Install the MCP server to give your AI tools access to
            quality-scored government data worldwide.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/idemfede/agora"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
            >
              View on GitHub
            </a>
            <a
              href="/ranking"
              className="rounded-lg border border-brand-400/50 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Explore ranking
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function CapabilityCard({
  title,
  desc,
  detail,
}: {
  title: string;
  desc: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <code className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
          {detail}
        </code>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
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

function DimensionCard({
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
