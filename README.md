# Agora

**Open Data Intelligence** — Automated quality analysis of government open data portals worldwide.

We scored **17,693 datasets** and **39,531 resources** across **6 countries**. NYC Open Data leads at 81%. Uruguay trails at 49%. [See the full ranking.](#quality-dashboard)

---

## What is this?

Government open data portals are a silent disaster: broken links, corrupted CSVs, data from 2018 labeled "updated", 2GB files with no documentation. Nobody monitors this systematically.

Agora fixes that with two tools:

### Agora MCP — Open data for LLMs

An [MCP server](https://modelcontextprotocol.io) that gives AI assistants direct access to open data catalogs. Search datasets, inspect files, run SQL — all in natural language.

```bash
npx agora-mcp
```

- Hybrid search: full-text (BM25) + semantic embeddings + Reciprocal Rank Fusion
- SQL on remote CSVs via DuckDB — no need to download 500MB files
- Multi-catalog: 18 portals across 13 countries (CKAN + Socrata)
- Language-aware: Spanish and English stemmers, country-specific acronym expansion
- Non-blocking startup: search available in seconds, embeddings build in background

### Agora Platform — Quality scores for open data

An automated pipeline that evaluates every dataset across four dimensions and publishes the results as a static website.

| Dimension | What it measures | How |
|-----------|-----------------|-----|
| **Accessibility** | Can data be downloaded? | HEAD requests to every resource URL |
| **Structure** | Is it machine-readable? | Format scoring (CSV > XLS > PDF) |
| **Freshness** | When was it last updated? | Exponential decay, 180-day half-life |
| **Completeness** | Is metadata filled in? | 8 weighted fields (title, description, org, tags...) |

The pipeline runs weekly via GitHub Actions, generates JSON scores, and publishes a static dashboard at zero hosting cost.

---

## Quality Dashboard

Latest scoring run: 6 catalogs, 17,693 datasets.

| Portal | Country | Datasets | Overall | Accessibility | Structure | Freshness |
|--------|---------|----------|---------|---------------|-----------|-----------|
| NYC Open Data | US | 3,245 | **81%** | 93% | 86% | 72% |
| data.gov.uk | GB | 4,521 | **72%** | 65% | 81% | 69% |
| datos.gob.ar | AR | 1,247 | **63%** | 71% | 69% | 42% |
| datos.gov.co | CO | 7,834 | **58%** | 82% | 71% | 30% |
| datos.gob.cl | CL | 534 | **55%** | 61% | 59% | 38% |
| catalogodatos.gub.uy | UY | 312 | **49%** | 53% | 52% | 31% |

---

## Quick Start

### Use with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agora": {
      "command": "npx",
      "args": ["-y", "agora-mcp"]
    }
  }
}
```

### Use with Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agora": {
      "command": "npx",
      "args": ["-y", "agora-mcp"]
    }
  }
}
```

### Use with Claude Code

```bash
claude mcp add agora -- npx -y agora-mcp
```

### Multi-catalog

By default, Agora connects to Argentina's datos.gob.ar. To search multiple catalogs:

```json
{
  "mcpServers": {
    "agora": {
      "command": "npx",
      "args": ["-y", "agora-mcp"],
      "env": {
        "AGORA_PRESETS": "latam"
      }
    }
  }
}
```

Available presets: `argentina`, `latam` (AR, CL, UY, MX, DO, CR, CO), `europe` (GB, IE, IT, CH), `english` (US, GB, CA, IE + US cities), `all`.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `buscar_datasets` | Search datasets with hybrid search (semantic + full-text) |
| `info_dataset` | Get detailed metadata and download URLs |
| `inspeccionar_recurso` | Download a resource and show its schema, types, and sample data |
| `consultar_sql` | Execute SQL queries on remote CSV/JSON/XLSX via DuckDB |
| `crear_sesion_sql` | Create a multi-table SQL session to join data across files |
| `cerrar_sesion` | Close a SQL session |
| `verificar_recursos` | Check resource URLs for availability (HEAD requests) |
| `listar_catalogos` | List active catalogs with dataset counts |

---

## Architecture

```
packages/
├── mcp/        MCP Server — search, SQL analysis, multi-protocol adapters
├── platform/   Scoring pipeline — 4 dimension scorers, GitHub Action
├── web/        Dashboard — Next.js static export, Tailwind CSS
└── sdk/        Shared types — Zod schemas, DatasetRecord model
```

**Tech stack:** TypeScript, MCP SDK, DuckDB, ONNX Runtime, Vectra, Next.js 16, Tailwind CSS, pnpm workspaces, Turborepo.

### How search works

1. On startup, Agora fetches catalog metadata and builds a DuckDB full-text index with language-aware stemming (seconds)
2. In the background, it generates local embeddings using a small transformer model (~90MB, downloaded once)
3. Searches start as FTS-only and upgrade to hybrid (FTS + semantic + RRF) when embeddings are ready
4. Query expansion adds synonyms and country-specific acronyms (e.g., "INDEC" expands for Argentina)

### How scoring works

```
GitHub Action (weekly cron)
    │
    ├── Fetch metadata from 10 catalogs (CKAN + Socrata APIs)
    ├── Score each dataset on 4 dimensions
    ├── Aggregate catalog-level summaries
    └── Write JSON files → commit to repo → static site rebuilds
```

---

## Development

```bash
# Prerequisites: Node >= 20, pnpm
pnpm install
pnpm build        # Build all packages (SDK → MCP → Platform → Web)
pnpm test         # Run all tests (~410 tests, 38 suites)
pnpm lint         # ESLint
pnpm typecheck    # TypeScript strict mode
pnpm format       # Prettier
```

### Run the MCP server locally

```bash
pnpm --filter @agora/mcp run build
node packages/mcp/dist/index.js
```

### Run the scoring pipeline

```bash
pnpm --filter @agora/platform run score
# Output: packages/web/data/*.json
```

### Run the dashboard

```bash
pnpm --filter @agora/web run dev
# http://localhost:3000
```

---

## Configuration

All environment variables are optional.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGORA_PRESETS` | — | Catalog presets: `argentina`, `latam`, `english`, `all` |
| `AGORA_CATALOGS` | — | Specific catalog IDs (comma-separated) |
| `AGORA_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `AGORA_DATA_DIR` | `~/.agora/data` | Persistent storage (metadata, indexes) |
| `AGORA_CACHE_DIR` | `~/.agora/cache` | Downloaded file cache |
| `AGORA_METADATA_TTL_HOURS` | `24` | Metadata cache TTL |
| `AGORA_QUERY_TIMEOUT_MS` | `60000` | SQL query timeout (max 300,000ms) |
| `AGORA_MAX_FILE_SIZE_MB` | `200` | Max file size for download; larger files use DuckDB httpfs |

If neither `AGORA_PRESETS` nor `AGORA_CATALOGS` is set, defaults to `datos-gob-ar` (Argentina).

---

## Supported Catalogs

| Country | Portal | Protocol | Language |
|---------|--------|----------|----------|
| AR | [datos.gob.ar](https://datos.gob.ar) | CKAN | Spanish |
| CL | [datos.gob.cl](https://datos.gob.cl) | CKAN | Spanish |
| UY | [catalogodatos.gub.uy](https://catalogodatos.gub.uy) | CKAN | Spanish |
| MX | [datos.gob.mx](https://datos.gob.mx) | CKAN | Spanish |
| CO | [datos.gov.co](https://www.datos.gov.co) | Socrata | Spanish |
| DO | [datos.gob.do](https://datos.gob.do) | CKAN | Spanish |
| CR | [datos.go.cr](https://datos.go.cr) | CKAN | Spanish |
| US | [catalog.data.gov](https://catalog.data.gov) | CKAN | English |
| US | [NYC Open Data](https://data.cityofnewyork.us) | Socrata | English |
| US | [Chicago Data Portal](https://data.cityofchicago.org) | Socrata | English |
| US | [Los Angeles Open Data](https://data.lacity.org) | Socrata | English |
| US | [San Francisco Open Data](https://data.sfgov.org) | Socrata | English |
| US | [Seattle Open Data](https://data.seattle.gov) | Socrata | English |
| GB | [data.gov.uk](https://data.gov.uk) | CKAN | English |
| CA | [open.canada.ca](https://open.canada.ca) | CKAN | English |
| IE | [data.gov.ie](https://data.gov.ie) | CKAN | English |
| IT | [dati.gov.it](https://www.dati.gov.it) | CKAN | Italian |
| CH | [opendata.swiss](https://opendata.swiss) | CKAN | German |

---

## License

[MIT](LICENSE)
