# Ágora SDK

Shared protocol between Ágora MCP and Ágora Platform.

## What it defines

- **Event schemas**: telemetry events sent from MCP → Platform
- **Score types**: quality score responses from Platform → MCP
- **API contracts**: REST endpoints for events, scores, catalogs
- **Common types**: DatasetRecord, ResourceRecord, CatalogConfig

## Planned API

```
// Telemetry: MCP → Platform
POST /v1/events/batch

// Quality scores: Platform → MCP
GET /v1/datasets/{id}/score

// Catalog registry: Platform → MCP
GET /v1/catalogs
```

## Status

Not started. Will be implemented alongside MCP v2.
