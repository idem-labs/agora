import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "./config.js";

const AGORA_HOME = join(homedir(), ".agora");

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all AGORA_ env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("AGORA_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns sensible defaults when no env vars set", () => {
    const config = loadConfig();

    expect(config.dataDir).toBe(join(AGORA_HOME, "data"));
    expect(config.cacheDir).toBe(join(AGORA_HOME, "cache"));
    expect(config.logLevel).toBe("info");
    expect(config.metadataTtlHours).toBe(24);
    expect(config.presets).toEqual([]);
    expect(config.catalogIds).toEqual([]);
  });

  it("reads AGORA_DATA_DIR", () => {
    process.env.AGORA_DATA_DIR = "/tmp/agora-data";
    expect(loadConfig().dataDir).toBe("/tmp/agora-data");
  });

  it("reads AGORA_CACHE_DIR", () => {
    process.env.AGORA_CACHE_DIR = "/tmp/agora-cache";
    expect(loadConfig().cacheDir).toBe("/tmp/agora-cache");
  });

  it("reads AGORA_LOG_LEVEL", () => {
    process.env.AGORA_LOG_LEVEL = "debug";
    expect(loadConfig().logLevel).toBe("debug");
  });

  it("falls back to info for invalid log level", () => {
    process.env.AGORA_LOG_LEVEL = "verbose";
    expect(loadConfig().logLevel).toBe("info");
  });

  it("reads AGORA_LOG_LEVEL case-insensitively", () => {
    process.env.AGORA_LOG_LEVEL = "WARN";
    expect(loadConfig().logLevel).toBe("warn");
  });

  it("reads AGORA_METADATA_TTL_HOURS", () => {
    process.env.AGORA_METADATA_TTL_HOURS = "48";
    expect(loadConfig().metadataTtlHours).toBe(48);
  });

  it("falls back to default for invalid TTL", () => {
    process.env.AGORA_METADATA_TTL_HOURS = "-5";
    expect(loadConfig().metadataTtlHours).toBe(24);
  });

  it("falls back to default for non-numeric TTL", () => {
    process.env.AGORA_METADATA_TTL_HOURS = "abc";
    expect(loadConfig().metadataTtlHours).toBe(24);
  });

  it("reads AGORA_PRESETS as comma-separated list", () => {
    process.env.AGORA_PRESETS = "argentina, latam";
    const config = loadConfig();
    expect(config.presets).toEqual(["argentina", "latam"]);
  });

  it("reads AGORA_CATALOGS as comma-separated list", () => {
    process.env.AGORA_CATALOGS = "datos-gob-ar,datos-gob-cl";
    const config = loadConfig();
    expect(config.catalogIds).toEqual(["datos-gob-ar", "datos-gob-cl"]);
  });

  it("handles empty AGORA_PRESETS", () => {
    process.env.AGORA_PRESETS = "";
    expect(loadConfig().presets).toEqual([]);
  });

  it("trims whitespace in comma-separated values", () => {
    process.env.AGORA_CATALOGS = " datos-gob-ar , datos-gob-cl ";
    expect(loadConfig().catalogIds).toEqual(["datos-gob-ar", "datos-gob-cl"]);
  });

  describe("queryTimeoutMs", () => {
    it("defaults to 60000", () => {
      expect(loadConfig().queryTimeoutMs).toBe(60_000);
    });

    it("reads AGORA_QUERY_TIMEOUT_MS", () => {
      process.env.AGORA_QUERY_TIMEOUT_MS = "120000";
      expect(loadConfig().queryTimeoutMs).toBe(120_000);
    });

    it("caps at 300000ms", () => {
      process.env.AGORA_QUERY_TIMEOUT_MS = "999999";
      expect(loadConfig().queryTimeoutMs).toBe(300_000);
    });

    it("falls back to default for invalid value", () => {
      process.env.AGORA_QUERY_TIMEOUT_MS = "not-a-number";
      expect(loadConfig().queryTimeoutMs).toBe(60_000);
    });

    it("falls back to default for negative value", () => {
      process.env.AGORA_QUERY_TIMEOUT_MS = "-100";
      expect(loadConfig().queryTimeoutMs).toBe(60_000);
    });
  });
});
