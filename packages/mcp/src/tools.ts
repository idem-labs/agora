import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Logger } from "./logger.js";
import type { CatalogRegistry } from "./catalogs/catalog-registry.js";
import type { IngestionService } from "./ingestion-service.js";
import type { HybridSearchEngine } from "./search/search-engine.js";
import type { AnalysisEngine } from "./analysis/analysis-engine.js";
import { SqlSanitizationError } from "./analysis/sql-sanitizer.js";
import type { HealthCache } from "./health/health-cache.js";

export function registerTools(
  server: McpServer,
  logger: Logger,
  registry: CatalogRegistry,
  ingestion: IngestionService,
  searchEngine: HybridSearchEngine,
  analysisEngine: AnalysisEngine,
  healthCache: HealthCache,
): void {
  server.registerTool(
    "buscar_datasets",
    {
      description:
        "Busca datasets en catálogos de datos abiertos gubernamentales. " +
        "Soporta búsqueda semántica y por palabras clave.",
      inputSchema: {
        query: z.string().describe("Término de búsqueda"),
        catalogo: z
          .string()
          .optional()
          .describe("ID del catálogo (ej: datos-gob-ar)"),
        organizacion: z
          .string()
          .optional()
          .describe("Filtrar por organización publicadora"),
        formato: z
          .string()
          .optional()
          .describe("Filtrar por formato de recurso (CSV, JSON, XLS, etc.)"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Filtrar por etiquetas temáticas"),
        limite: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Número máximo de resultados"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      logger.debug("buscar_datasets called", { args });

      const { results, searchMode } = await searchEngine.search(args.query, {
        catalogo: args.catalogo,
        organizacion: args.organizacion,
        formato: args.formato,
        tags: args.tags,
        limite: args.limite,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No se encontraron datasets para: "${args.query}"`,
            },
          ],
          _meta: { searchMode },
        };
      }

      // Check cached health data for result annotation (no scan triggered)
      // Merge health data from all searched catalogs
      const searchedCatalogIds = args.catalogo
        ? [args.catalogo]
        : ingestion.getCatalogIds();
      const healthData: Record<string, { status: number }> = {};
      for (const catId of searchedCatalogIds) {
        Object.assign(healthData, healthCache.getAllCached(catId));
      }

      // Build catalog name lookup for multi-catalog results
      const catalogNames = new Map<string, string>();
      for (const c of registry.list()) {
        catalogNames.set(c.id, c.name);
      }
      const showCatalog = searchedCatalogIds.length > 1;

      const lines: string[] = [];
      for (const { dataset } of results) {
        const formats = dataset.resources.length > 0
          ? dataset.resources.map((r) => r.format).filter(Boolean).join(", ")
          : "—";

        // Annotate with health status if cached
        let healthTag = "";
        if (dataset.resources.length > 0 && Object.keys(healthData).length > 0) {
          const checked = dataset.resources.filter((r) => healthData[r.url]);
          if (checked.length > 0) {
            const ok = checked.filter(
              (r) => healthData[r.url].status >= 200 && healthData[r.url].status < 400,
            ).length;
            healthTag = ok === checked.length
              ? " | Accesible"
              : ok === 0
                ? " | Inaccesible"
                : ` | ${ok}/${checked.length} accesibles`;
          }
        }

        const catalogTag = showCatalog
          ? ` | Catálogo: ${catalogNames.get(dataset.catalogId) ?? dataset.catalogId}`
          : "";

        lines.push(
          `- **${dataset.title}** (${dataset.id})`,
          `  Org: ${dataset.organization ?? "—"} | Formatos: ${formats}${catalogTag}${healthTag}`,
        );
        if (dataset.description) {
          const desc = dataset.description.length > 150
            ? dataset.description.substring(0, 150) + "…"
            : dataset.description;
          lines.push(`  ${desc}`);
        }
      }

      const header =
        `Resultados (${results.length}) — modo: ${searchMode}\n\n`;
      return {
        content: [{ type: "text" as const, text: header + lines.join("\n") }],
        _meta: { searchMode },
      };
    },
  );

  server.registerTool(
    "inspeccionar_recurso",
    {
      description:
        "Descarga un recurso (CSV, XLS, etc.) y muestra su estructura: " +
        "columnas, tipos de datos, cantidad de filas y vista previa.",
      inputSchema: {
        url: z.string().url().describe("URL del recurso a inspeccionar"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      logger.debug("inspeccionar_recurso called", { args });
      try {
        const result = await analysisEngine.inspect(args.url);

        const lines: string[] = [];
        lines.push(`## Estructura del recurso`);
        lines.push("");
        lines.push(`**URL:** ${args.url}`);
        lines.push(`**Encoding:** ${result.encoding}`);
        lines.push(`**Filas:** ${result.rowCount.toLocaleString()}`);
        lines.push(`**Columnas:** ${result.columns.length}`);
        if (result.fromCache) lines.push(`*(datos cacheados)*`);
        lines.push("");

        // Column table
        lines.push("| Columna | Tipo |");
        lines.push("|---------|------|");
        for (const col of result.columns) {
          lines.push(`| ${col.name} | ${col.type} |`);
        }

        // Preview
        if (result.preview.length > 0) {
          lines.push("");
          lines.push(`### Vista previa (${result.preview.length} filas)`);
          lines.push("");
          const headers = result.columns.map((c) => c.name);
          lines.push("| " + headers.join(" | ") + " |");
          lines.push("| " + headers.map(() => "---").join(" | ") + " |");
          for (const row of result.preview) {
            const cells = headers.map((h) => String(row[h] ?? ""));
            lines.push("| " + cells.join(" | ") + " |");
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        logger.error("inspeccionar_recurso failed", {
          url: args.url,
          error: String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error al inspeccionar recurso: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "crear_sesion_sql",
    {
      description:
        "Crea una sesión SQL con múltiples CSVs cargados como tablas nombradas. " +
        "Permite hacer JOINs entre datasets y análisis iterativo. " +
        "Ejemplo: crear_sesion_sql({recursos: [{nombre: 'accidentes', url: '...'}, {nombre: 'poblacion', url: '...'}]})",
      inputSchema: {
        recursos: z
          .array(
            z.object({
              nombre: z
                .string()
                .describe("Nombre de la tabla (letras, números, guiones bajos)"),
              url: z.string().url().describe("URL del recurso CSV"),
            }),
          )
          .min(1)
          .max(10)
          .describe("Lista de recursos a cargar como tablas"),
      },
    },
    async (args) => {
      logger.debug("crear_sesion_sql called", { args });
      try {
        const result = await analysisEngine.createSession(args.recursos);
        const lines = [
          `Sesión creada: \`${result.sessionId}\``,
          "",
          `**Tablas disponibles:** ${result.tablas.join(", ")}`,
          "",
          "Usá `consultar_sql` con el sessionId para ejecutar queries.",
          "Podés hacer JOINs entre las tablas y crear tablas temporales con CREATE TEMP TABLE.",
          "La sesión se cierra automáticamente después de 10 minutos de inactividad.",
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        logger.error("crear_sesion_sql failed", { error: String(err) });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error al crear sesión: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "consultar_sql",
    {
      description:
        "Ejecuta una consulta SQL sobre datos. Dos modos:\n" +
        "1. Modo simple: pasá url + sql. Usa la tabla 'datos'. Ej: SELECT * FROM datos WHERE edad > 30\n" +
        "2. Modo sesión: pasá sessionId + sql. Usa las tablas nombradas de la sesión. Permite JOINs y CREATE TEMP TABLE.\n" +
        "Soporta paginación con limite y offset.",
      inputSchema: {
        url: z
          .string()
          .url()
          .optional()
          .describe("URL del recurso CSV (modo simple — usar tabla 'datos')"),
        sessionId: z
          .string()
          .optional()
          .describe("ID de sesión (modo sesión — usar tablas nombradas)"),
        sql: z
          .string()
          .describe(
            "Consulta SQL. En modo simple usar 'datos'. En modo sesión usar los nombres de tabla de la sesión. NO incluir LIMIT/OFFSET — usar los parámetros limite y offset.",
          ),
        limite: z
          .number()
          .int()
          .min(1)
          .max(10000)
          .optional()
          .describe("Máximo de filas a devolver (default 1000, max 10000)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Filas a saltar antes de devolver resultados (default 0)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      logger.debug("consultar_sql called", { args });

      // Validate: exactly one of url or sessionId
      if (args.url && args.sessionId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Usá url (modo simple) o sessionId (modo sesión), no ambos.",
            },
          ],
          isError: true,
        };
      }
      if (!args.url && !args.sessionId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Debés proporcionar url (modo simple) o sessionId (modo sesión).",
            },
          ],
          isError: true,
        };
      }

      try {
        const result = args.sessionId
          ? await analysisEngine.querySession(args.sessionId, args.sql, {
              limite: args.limite,
              offset: args.offset,
            })
          : await analysisEngine.query(args.url!, args.sql, {
              limite: args.limite,
              offset: args.offset,
            });

        // CREATE TEMP TABLE returns empty result
        if (result.columns.length === 0 && result.rowCount === 0 && args.sessionId) {
          return {
            content: [{ type: "text" as const, text: "Tabla temporal creada." }],
          };
        }

        const lines: string[] = [];

        lines.push(`**Filas:** ${result.rowCount} de ${result.totalRows.toLocaleString()} totales`);
        if (result.hasMore) {
          const nextOffset = (args.offset ?? 0) + result.rowCount;
          lines.push(
            `*Hay más resultados. Usá offset: ${nextOffset} para la siguiente página.*`,
          );
        }
        lines.push("");

        // Result table
        if (result.rows.length > 0) {
          const headers = result.columns.map((c) => c.name);
          lines.push("| " + headers.join(" | ") + " |");
          lines.push("| " + headers.map(() => "---").join(" | ") + " |");
          for (const row of result.rows) {
            const cells = headers.map((h) => {
              const v = row[h];
              if (v === null || v === undefined) return "NULL";
              return String(v);
            });
            lines.push("| " + cells.join(" | ") + " |");
          }
        } else {
          lines.push("La consulta no devolvió resultados.");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        logger.error("consultar_sql failed", {
          url: args.url,
          sessionId: args.sessionId,
          error: String(err),
        });
        logger.debug("consultar_sql failed query", { sql: args.sql });
        const msg =
          err instanceof SqlSanitizationError
            ? err.message
            : `Error al ejecutar consulta: ${err instanceof Error ? err.message : String(err)}`;
        return {
          content: [{ type: "text" as const, text: msg }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "cerrar_sesion",
    {
      description:
        "Cierra una sesión SQL y libera la memoria. " +
        "Las sesiones también se cierran automáticamente después de 10 minutos de inactividad.",
      inputSchema: {
        sessionId: z.string().describe("ID de la sesión a cerrar"),
      },
    },
    async (args) => {
      logger.debug("cerrar_sesion called", { args });
      try {
        analysisEngine.closeSession(args.sessionId);
        return {
          content: [{ type: "text" as const, text: "Sesión cerrada." }],
        };
      } catch (err) {
        logger.error("cerrar_sesion failed", { error: String(err) });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error al cerrar sesión: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "verificar_recursos",
    {
      description:
        "Verifica la accesibilidad de los recursos de un dataset (HEAD request). " +
        "Útil antes de inspeccionar o consultar un dataset para saber cuáles URLs funcionan.",
      inputSchema: {
        id: z.string().describe("ID del dataset (ej: datos-gob-ar:presupuesto-2024)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      logger.debug("verificar_recursos called", { args });

      const record = ingestion.getDataset(args.id);
      if (!record) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Dataset no encontrado: ${args.id}`,
            },
          ],
          isError: true,
        };
      }

      if (record.resources.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `El dataset "${record.title}" no tiene recursos.`,
            },
          ],
        };
      }

      const urls = record.resources.map((r) => r.url);
      const results = await healthCache.checkMany(record.catalogId, urls);

      const lines: string[] = [
        `## Verificación de recursos: ${record.title}`,
        "",
      ];

      let accessible = 0;
      let failed = 0;

      for (const resource of record.resources) {
        const health = results.get(resource.url);
        if (!health) continue;

        const icon = health.status >= 200 && health.status < 400 ? "OK" : "FALLA";
        const statusText =
          health.status === 0
            ? "sin respuesta (timeout/error de red)"
            : `HTTP ${health.status}`;
        const size = health.contentLength
          ? ` | ${formatBytes(health.contentLength)}`
          : "";
        const format = resource.format || "?";

        lines.push(
          `- **[${icon}]** ${resource.name || resource.url}`,
          `  ${format}${size} | ${statusText} | ${health.latencyMs}ms`,
          `  ${resource.url}`,
        );

        if (health.status >= 200 && health.status < 400) {
          accessible++;
        } else {
          failed++;
        }
      }

      lines.push("");
      lines.push(
        `**Resumen:** ${accessible} accesible(s), ${failed} inaccesible(s) de ${record.resources.length} recurso(s).`,
      );

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "listar_catalogos",
    {
      description:
        "Lista los catálogos de datos abiertos disponibles con su estado " +
        "y cantidad de datasets indexados.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      logger.debug("listar_catalogos called");
      const catalogs = registry.list();
      const lines = catalogs.map((c) => {
        const count = ingestion.getDatasetsByCatalog(c.id).length;
        return (
          `- **${c.name}** (${c.id})\n  Tipo: ${c.type} | URL: ${c.url}` +
          (c.country ? ` | País: ${c.country}` : "") +
          ` | Datasets: ${count}`
        );
      });
      const text =
        catalogs.length > 0
          ? `Catálogos disponibles (${catalogs.length}):\n\n${lines.join("\n\n")}`
          : "No hay catálogos configurados.";
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.registerTool(
    "info_dataset",
    {
      description:
        "Muestra información detallada de un dataset: título, descripción, " +
        "organización, recursos disponibles, formatos y fechas.",
      inputSchema: {
        id: z.string().describe("ID del dataset"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      logger.debug("info_dataset called", { args });

      const record = ingestion.getDataset(args.id);
      if (!record) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Dataset no encontrado: ${args.id}`,
            },
          ],
          isError: true,
        };
      }

      const lines: string[] = [
        `# ${record.title}`,
        "",
        `**ID:** ${record.id}`,
        `**Catálogo:** ${record.catalogId}`,
      ];

      if (record.organization) {
        lines.push(`**Organización:** ${record.organization}`);
      }
      if (record.description) {
        lines.push("", record.description);
      }
      if (record.tags.length > 0) {
        lines.push("", `**Etiquetas:** ${record.tags.join(", ")}`);
      }
      if (record.license) {
        lines.push(`**Licencia:** ${record.license}`);
      }
      if (record.createdAt) {
        lines.push(`**Creado:** ${record.createdAt}`);
      }
      if (record.modifiedAt) {
        lines.push(`**Modificado:** ${record.modifiedAt}`);
      }

      if (record.resources.length > 0) {
        lines.push("", `## Recursos (${record.resources.length})`, "");
        for (const r of record.resources) {
          const size = r.sizeBytes
            ? ` | ${formatBytes(r.sizeBytes)}`
            : "";
          lines.push(
            `- **${r.name || r.format}** (${r.format}${size})`,
            `  ${r.url}`,
          );
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
