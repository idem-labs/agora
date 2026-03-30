import { describe, it, expect } from "vitest";
import { AR_SERIES_CATALOG } from "./series-catalog.js";

describe("AR_SERIES_CATALOG", () => {
  it("contains ~18 core series", () => {
    expect(AR_SERIES_CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(AR_SERIES_CATALOG.length).toBeLessThanOrEqual(25);
  });

  it("all entries have required fields", () => {
    for (const series of AR_SERIES_CATALOG) {
      expect(series.id).toBeTruthy();
      expect(series.title).toBeTruthy();
      expect(series.shortName).toBeTruthy();
      expect(series.frequency).toBeTruthy();
      expect(series.units).toBeTruthy();
      expect(series.source).toBeTruthy();
      expect(series.category).toBeTruthy();
    }
  });

  it("has no duplicate IDs", () => {
    const ids = AR_SERIES_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers key economic categories", () => {
    const categories = new Set(AR_SERIES_CATALOG.map((s) => s.category));
    expect(categories).toContain("precios");
    expect(categories).toContain("actividad");
    expect(categories).toContain("monetario");
    expect(categories).toContain("empleo");
  });

  it("includes the most important series", () => {
    const ids = new Set(AR_SERIES_CATALOG.map((s) => s.id));
    expect(ids.has("103.1_I2N_2016_M_19")).toBe(true); // IPC
    expect(ids.has("143.3_NO_PR_2004_A_21")).toBe(true); // EMAE
    expect(ids.has("168.1_T_CAMBIOR_D_0_0_26")).toBe(true); // Tipo de Cambio
    expect(ids.has("174.1_RRVAS_IDOS_0_0_36")).toBe(true); // Reservas
  });
});
