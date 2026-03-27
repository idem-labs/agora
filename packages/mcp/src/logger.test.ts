import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: MockInstance<any>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("writes JSON lines to stderr", () => {
    const logger = createLogger("debug");
    logger.info("hello");

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim());

    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("hello");
    expect(parsed.timestamp).toBeDefined();
  });

  it("includes extra data fields", () => {
    const logger = createLogger("debug");
    logger.info("test", { count: 42, source: "ckan" });

    const parsed = JSON.parse((stderrSpy.mock.calls[0]![0] as string).trim());
    expect(parsed.count).toBe(42);
    expect(parsed.source).toBe("ckan");
  });

  it("respects log level threshold — suppresses debug when level is info", () => {
    const logger = createLogger("info");
    logger.debug("should be suppressed");

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("respects log level threshold — allows warn when level is info", () => {
    const logger = createLogger("info");
    logger.warn("should pass");

    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("error level passes all thresholds", () => {
    const logger = createLogger("error");
    logger.debug("no");
    logger.info("no");
    logger.warn("no");
    logger.error("yes");

    expect(stderrSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse((stderrSpy.mock.calls[0]![0] as string).trim());
    expect(parsed.level).toBe("error");
  });

  it("never writes to stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const logger = createLogger("debug");

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
