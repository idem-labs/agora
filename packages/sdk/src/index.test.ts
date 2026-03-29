import { describe, it, expect } from "vitest";
import {
  Catalog,
  CatalogType,
  Resource,
  DatasetRecord,
  QualityDimension,
  QualityScore,
  QUALITY_WEIGHTS,
} from "./index.js";
import { SearchEvent, QueryEvent, UsageEvent, EventBatch } from "./events.js";

describe("catalog schemas", () => {
  it("validates a CatalogType", () => {
    expect(CatalogType.parse("ckan")).toBe("ckan");
    expect(() => CatalogType.parse("invalid")).toThrow();
  });

  it("validates a Catalog", () => {
    const result = Catalog.parse({
      id: "datos-gob-ar",
      name: "datos.gob.ar",
      url: "https://datos.gob.ar",
      type: "ckan",
      country: "AR",
    });
    expect(result.id).toBe("datos-gob-ar");
    expect(result.enabled).toBe(true); // default
  });

  it("validates a Resource", () => {
    const result = Resource.parse({
      id: "r1",
      datasetId: "d1",
      url: "https://example.com/data.csv",
      format: "CSV",
    });
    expect(result.format).toBe("CSV");
  });

  it("validates a DatasetRecord", () => {
    const result = DatasetRecord.parse({
      id: "d1",
      catalogId: "datos-gob-ar",
      externalId: "abc-123",
      title: "Presupuesto Nacional 2024",
      tags: ["presupuesto", "finanzas"],
      resources: [
        {
          id: "r1",
          datasetId: "d1",
          url: "https://example.com/data.csv",
          format: "CSV",
        },
      ],
    });
    expect(result.title).toBe("Presupuesto Nacional 2024");
    expect(result.resources).toHaveLength(1);
  });

  it("rejects invalid URLs", () => {
    expect(() =>
      Catalog.parse({
        id: "test",
        name: "test",
        url: "not-a-url",
        type: "ckan",
      }),
    ).toThrow();
  });
});

describe("event schemas", () => {
  const now = new Date().toISOString();

  it("validates a SearchEvent", () => {
    const result = SearchEvent.parse({
      type: "search",
      timestamp: now,
      clientId: "client-1",
      query: "presupuesto",
      success: true,
      resultCount: 15,
    });
    expect(result.type).toBe("search");
  });

  it("validates a QueryEvent", () => {
    const result = QueryEvent.parse({
      type: "query",
      timestamp: now,
      clientId: "client-1",
      sql: "SELECT * FROM data LIMIT 10",
      success: true,
      resourceUrl: "https://example.com/data.csv",
    });
    expect(result.type).toBe("query");
  });

  it("validates discriminated union", () => {
    const event = UsageEvent.parse({
      type: "error",
      timestamp: now,
      clientId: "client-1",
      success: false,
      errorCode: "TIMEOUT",
      errorMessage: "Request timed out",
    });
    expect(event.type).toBe("error");
  });

  it("validates an EventBatch", () => {
    const batch = EventBatch.parse({
      clientId: "client-1",
      events: [
        {
          type: "search",
          timestamp: now,
          clientId: "client-1",
          query: "test",
          success: true,
          resultCount: 0,
        },
      ],
    });
    expect(batch.events).toHaveLength(1);
  });

  it("rejects empty EventBatch", () => {
    expect(() =>
      EventBatch.parse({
        clientId: "client-1",
        events: [],
      }),
    ).toThrow();
  });
});

describe("quality schemas", () => {
  it("validates QualityDimension", () => {
    expect(QualityDimension.parse("accessibility")).toBe("accessibility");
    expect(() => QualityDimension.parse("invalid")).toThrow();
  });

  it("validates QualityScore", () => {
    const now = new Date().toISOString();
    const result = QualityScore.parse({
      datasetId: "d1",
      overall: 0.75,
      dimensions: [
        { dimension: "accessibility", score: 0.9, calculatedAt: now },
        { dimension: "freshness", score: 0.6, calculatedAt: now },
      ],
      lastChecked: now,
    });
    expect(result.overall).toBe(0.75);
    expect(result.dimensions).toHaveLength(2);
  });

  it("rejects score out of range", () => {
    const now = new Date().toISOString();
    expect(() =>
      QualityScore.parse({
        datasetId: "d1",
        overall: 1.5,
        dimensions: [],
        lastChecked: now,
      }),
    ).toThrow();
  });

  it("has weights that sum to 1", () => {
    const sum = Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
