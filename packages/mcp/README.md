# Ágora MCP Server

MCP server that gives LLMs access to open government data catalogs. Search datasets, inspect file structures, and run SQL queries — all from your AI assistant.

## Quick Start

```bash
npx agora-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `buscar_datasets` | Search datasets with hybrid search (semantic + full-text) |
| `info_dataset` | Get detailed dataset metadata and download URLs |
| `inspeccionar_recurso` | Download a resource and show its schema, types, and preview |
| `consultar_sql` | Execute SQL on a remote CSV/JSON/XLSX via DuckDB |
| `crear_sesion_sql` | Create a multi-table SQL session to join data across files |
| `cerrar_sesion` | Close a SQL session |
| `verificar_recursos` | Check resource URLs for availability (HEAD requests) |
| `listar_catalogos` | List available open data catalogs |

## Setup

### Claude Desktop

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

### Cursor

Add to `.cursor/mcp.json` in your project:

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

### Claude Code

```bash
claude mcp add agora-mcp -- npx -y agora-mcp
```

## Configuration

All environment variables are optional. See [.env.example](.env.example) for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGORA_PRESETS` | `argentina` | Catalog bundles: `argentina`, `latam`, `europe`, `english`, `all` |
| `AGORA_CATALOGS` | — | Explicit catalog IDs (comma-separated). Combined with presets. |
| `AGORA_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `AGORA_DATA_DIR` | `~/.agora/data` | Persistent storage path |
| `AGORA_CACHE_DIR` | `~/.agora/cache` | File download cache path |
| `AGORA_METADATA_TTL_HOURS` | `24` | Metadata cache TTL |
| `AGORA_EMBEDDING_BATCH_SIZE` | `64` | Embedding batch size |
| `AGORA_QUERY_TIMEOUT_MS` | `60000` | SQL query timeout (max 300000) |
| `AGORA_MAX_FILE_SIZE_MB` | `200` | Max download size. Larger files use DuckDB httpfs streaming. |

Example with Latin American catalogs:

```json
{
  "mcpServers": {
    "agora": {
      "command": "npx",
      "args": ["-y", "agora-mcp"],
      "env": {
        "AGORA_PRESETS": "latam",
        "AGORA_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## How It Works

1. **Startup** (seconds): fetches catalog metadata, builds full-text search index with language-aware stemming
2. **Server ready**: accepts MCP requests immediately with FTS-based search
3. **Background**: generates local embeddings (first run downloads ~90MB model, then cached)
4. **Hybrid search**: once embeddings are ready, search upgrades to semantic + FTS with Reciprocal Rank Fusion

## Tech Stack

TypeScript, [Model Context Protocol](https://modelcontextprotocol.io), DuckDB, ONNX Runtime (local embeddings), Vectra (vector store)

## Requirements

- Node.js >= 20

## License

MIT
