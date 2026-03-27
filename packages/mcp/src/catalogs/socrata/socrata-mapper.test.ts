import { describe, it, expect } from "vitest";
import { mapSocrataResult } from "./socrata-mapper.js";
import type { SocrataResult } from "./socrata-types.js";

const CATALOG_ID = "data-cityofnewyork-us";

describe("mapSocrataResult", () => {
  const fullResult: SocrataResult = {
    resource: {
      id: "8wbx-tsch",
      name: "For Hire Vehicles (FHV) - Active",
      description: "<p>List of <b>active</b> for-hire vehicles.</p>",
      attribution: "Taxi and Limousine Commission (TLC)",
      type: "dataset",
      updatedAt: "2024-06-01T14:30:00.000Z",
      createdAt: "2024-01-15T10:00:00.000Z",
      data_updated_at: "2024-05-28T08:00:00.000Z",
    },
    classification: {
      domain_category: "Transportation",
      domain_tags: ["taxi", "fhv", "transportation"],
      domain_metadata: [],
    },
    metadata: {
      domain: "data.cityofnewyork.us",
      license: "Creative Commons Attribution 4.0 International",
    },
    permalink: "https://data.cityofnewyork.us/d/8wbx-tsch",
    link: "https://data.cityofnewyork.us/Transportation/FHV/8wbx-tsch",
    owner: { id: "o1", display_name: "NYC OpenData" },
    creator: { id: "c1", display_name: "TLC Admin" },
  };

  it("maps a complete Socrata result to DatasetRecord", () => {
    const record = mapSocrataResult(fullResult, CATALOG_ID);

    expect(record.id).toBe("data-cityofnewyork-us:8wbx-tsch");
    expect(record.catalogId).toBe(CATALOG_ID);
    expect(record.externalId).toBe("8wbx-tsch");
    expect(record.title).toBe("For Hire Vehicles (FHV) - Active");
    expect(record.organization).toBe(
      "Taxi and Limousine Commission (TLC)",
    );
    expect(record.tags).toEqual(["taxi", "fhv", "transportation"]);
    expect(record.license).toBe(
      "Creative Commons Attribution 4.0 International",
    );
    expect(record.createdAt).toBe("2024-01-15T10:00:00.000Z");
    expect(record.modifiedAt).toBe("2024-05-28T08:00:00.000Z");
  });

  it("strips HTML from description", () => {
    const record = mapSocrataResult(fullResult, CATALOG_ID);
    expect(record.description).toBe("List of active for-hire vehicles.");
  });

  it("generates CSV download URL as single resource", () => {
    const record = mapSocrataResult(fullResult, CATALOG_ID);

    expect(record.resources).toHaveLength(1);
    expect(record.resources[0].url).toBe(
      "https://data.cityofnewyork.us/api/views/8wbx-tsch/rows.csv?accessType=DOWNLOAD",
    );
    expect(record.resources[0].format).toBe("CSV");
    expect(record.resources[0].id).toBe("8wbx-tsch");
  });

  it("falls back to updatedAt when data_updated_at is null", () => {
    const result: SocrataResult = {
      ...fullResult,
      resource: {
        ...fullResult.resource,
        data_updated_at: null,
      },
    };

    const record = mapSocrataResult(result, CATALOG_ID);
    expect(record.modifiedAt).toBe("2024-06-01T14:30:00.000Z");
  });

  it("uses domain_metadata agency when attribution is missing", () => {
    const result: SocrataResult = {
      ...fullResult,
      resource: {
        ...fullResult.resource,
        attribution: undefined,
      },
      classification: {
        ...fullResult.classification,
        domain_metadata: [
          {
            key: "Dataset-Information_Agency",
            value: "Department of Finance",
          },
        ],
      },
    };

    const record = mapSocrataResult(result, CATALOG_ID);
    expect(record.organization).toBe("Department of Finance");
  });

  it("handles missing optional fields gracefully", () => {
    const minimal: SocrataResult = {
      resource: {
        id: "xxxx-yyyy",
        name: "Minimal Dataset",
        description: "",
        type: "dataset",
        updatedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      classification: {},
      metadata: { domain: "example.com" },
      permalink: "https://example.com/d/xxxx-yyyy",
      link: "https://example.com/d/xxxx-yyyy",
      owner: { id: "o1" },
      creator: { id: "c1" },
    };

    const record = mapSocrataResult(minimal, CATALOG_ID);

    expect(record.externalId).toBe("xxxx-yyyy");
    expect(record.title).toBe("Minimal Dataset");
    expect(record.description).toBeUndefined();
    expect(record.organization).toBeUndefined();
    expect(record.tags).toEqual([]);
    expect(record.license).toBeUndefined();
  });

  it("prefers domain_tags over classification tags", () => {
    const result: SocrataResult = {
      ...fullResult,
      classification: {
        tags: ["general-tag"],
        domain_tags: ["domain-specific-tag"],
      },
    };

    const record = mapSocrataResult(result, CATALOG_ID);
    expect(record.tags).toEqual(["domain-specific-tag"]);
  });
});
