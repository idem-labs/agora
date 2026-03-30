import { describe, it, expect } from "vitest";
import {
  normalizeFrequency,
  toApiCollapse,
  mapSearchResult,
  extractMetadataFromDataResponse,
  mapDataPoints,
} from "./mapper.js";
import type { ArSearchResult, ArSeriesDataResponse } from "./types.js";

describe("mapper", () => {
  describe("normalizeFrequency", () => {
    it("maps ISO 8601 recurrence to human-readable", () => {
      expect(normalizeFrequency("R/P1D")).toBe("daily");
      expect(normalizeFrequency("R/P1M")).toBe("monthly");
      expect(normalizeFrequency("R/P3M")).toBe("quarterly");
      expect(normalizeFrequency("R/P6M")).toBe("semiannual");
      expect(normalizeFrequency("R/P1Y")).toBe("yearly");
    });

    it("maps plain frequency names", () => {
      expect(normalizeFrequency("day")).toBe("daily");
      expect(normalizeFrequency("month")).toBe("monthly");
      expect(normalizeFrequency("year")).toBe("yearly");
    });

    it("passes through unknown values", () => {
      expect(normalizeFrequency("custom")).toBe("custom");
    });
  });

  describe("toApiCollapse", () => {
    it("maps collapse values", () => {
      expect(toApiCollapse("day")).toBe("day");
      expect(toApiCollapse("month")).toBe("month");
      expect(toApiCollapse("quarter")).toBe("quarter");
      expect(toApiCollapse("year")).toBe("year");
    });
  });

  describe("mapSearchResult", () => {
    it("maps search result to SeriesMetadata", () => {
      const result: ArSearchResult = {
        field: {
          id: "103.1_I2N_2016_M_19",
          title: "ipc_2016_nivgeneral",
          description: "IPC Nivel General",
          frequency: "R/P1M",
          time_index_start: "2016-12-01",
          time_index_end: "2026-02-01",
          units: "Índice Dic-2016=100",
        },
        dataset: {
          title: "IPC",
          source: "INDEC",
          theme: "Precios",
        },
      };

      const metadata = mapSearchResult(result);

      expect(metadata.id).toBe("103.1_I2N_2016_M_19");
      expect(metadata.title).toBe("ipc_2016_nivgeneral");
      expect(metadata.description).toBe("IPC Nivel General");
      expect(metadata.frequency).toBe("monthly");
      expect(metadata.units).toBe("Índice Dic-2016=100");
      expect(metadata.source).toBe("INDEC");
      expect(metadata.theme).toBe("Precios");
      expect(metadata.startDate).toBe("2016-12-01");
      expect(metadata.endDate).toBe("2026-02-01");
    });
  });

  describe("extractMetadataFromDataResponse", () => {
    it("extracts metadata from data response", () => {
      const response: ArSeriesDataResponse = {
        data: [["2025-01-01", 3820.5]],
        count: 1,
        meta: [
          { frequency: "month", start_date: "2016-12-01", end_date: "2026-02-01" },
          {
            catalog: { title: "Datos Abiertos" },
            dataset: {
              title: "IPC",
              description: "Índice de Precios al Consumidor",
              source: "INDEC",
              theme: ["Precios"],
            },
            distribution: { title: "IPC Nivel General" },
            field: {
              id: "103.1_I2N_2016_M_19",
              description: "IPC base dic-2016",
              units: "Índice Dic-2016=100",
            },
          },
        ],
        params: { ids: "103.1_I2N_2016_M_19", limit: "1", format: "json" },
      };

      const metadata = extractMetadataFromDataResponse(response);

      expect(metadata).not.toBeNull();
      expect(metadata!.id).toBe("103.1_I2N_2016_M_19");
      expect(metadata!.title).toBe("IPC base dic-2016");
      expect(metadata!.frequency).toBe("monthly");
      expect(metadata!.units).toBe("Índice Dic-2016=100");
      expect(metadata!.source).toBe("INDEC");
      expect(metadata!.startDate).toBe("2016-12-01");
      expect(metadata!.endDate).toBe("2026-02-01");
    });

    it("returns null if meta has insufficient entries", () => {
      const response: ArSeriesDataResponse = {
        data: [],
        count: 0,
        meta: [{ frequency: "month", start_date: "", end_date: "" }],
        params: { ids: "x", limit: "1", format: "json" },
      };

      expect(extractMetadataFromDataResponse(response)).toBeNull();
    });
  });

  describe("mapDataPoints", () => {
    it("maps data array to TimeSeriesDataPoint[]", () => {
      const data: [string, ...Array<number | null>][] = [
        ["2025-01-01", 100.5],
        ["2025-02-01", 102.3],
        ["2025-03-01", null],
      ];

      const points = mapDataPoints(data);

      expect(points).toHaveLength(3);
      expect(points[0]).toEqual({ date: "2025-01-01", value: 100.5 });
      expect(points[1]).toEqual({ date: "2025-02-01", value: 102.3 });
      expect(points[2]).toEqual({ date: "2025-03-01", value: null });
    });
  });
});
