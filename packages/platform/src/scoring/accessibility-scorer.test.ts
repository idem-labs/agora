import { createServer, type Server } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AccessibilityScorer, statusToScore } from "./accessibility-scorer.js";
import { makeMinimalDataset } from "../__fixtures__/sample-datasets.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case "/ok":
        res.writeHead(200);
        break;
      case "/redirect":
        res.writeHead(301, { Location: "/ok" });
        break;
      case "/forbidden":
        res.writeHead(403);
        break;
      case "/not-found":
        res.writeHead(404);
        break;
      case "/server-error":
        res.writeHead(500);
        break;
      case "/slow":
        // Never responds — triggers timeout
        return;
      default:
        res.writeHead(200);
        break;
    }
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address();
  if (typeof addr === "object" && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(() => {
  server?.close();
});

const scorer = new AccessibilityScorer({ headTimeoutMs: 2000, concurrency: 5 });

function resource(path: string) {
  return {
    id: `r-${path}`,
    datasetId: "test:ds1",
    url: `${baseUrl}${path}`,
    format: "CSV",
  };
}

describe("statusToScore", () => {
  it("maps 200 → 1.0", () => expect(statusToScore(200)).toBe(1.0));
  it("maps 204 → 1.0", () => expect(statusToScore(204)).toBe(1.0));
  it("maps 301 → 0.9", () => expect(statusToScore(301)).toBe(0.9));
  it("maps 302 → 0.9", () => expect(statusToScore(302)).toBe(0.9));
  it("maps 403 → 0.3", () => expect(statusToScore(403)).toBe(0.3));
  it("maps 404 → 0.0", () => expect(statusToScore(404)).toBe(0.0));
  it("maps 500 → 0.2", () => expect(statusToScore(500)).toBe(0.2));
  it("maps 503 → 0.2", () => expect(statusToScore(503)).toBe(0.2));
});

describe("AccessibilityScorer", () => {
  it("scores all-accessible resources at 1.0", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/ok"), resource("/ok")],
    });
    const result = await scorer.score(dataset);
    expect(result.dimension).toBe("accessibility");
    expect(result.score).toBe(1.0);
    expect(result.evidence!.accessible).toBe(2);
  });

  it("scores redirected resources at 0.9", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/redirect")],
    });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.9);
    expect(result.evidence!.accessible).toBe(1);
  });

  it("scores 404 resources at 0.0", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/not-found")],
    });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.0);
    expect(result.evidence!.accessible).toBe(0);
  });

  it("scores 403 resources at 0.3", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/forbidden")],
    });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.3);
  });

  it("scores 500 resources at 0.2", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/server-error")],
    });
    const result = await scorer.score(dataset);
    expect(result.score).toBe(0.2);
  });

  it("averages mixed statuses", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/ok"), resource("/not-found")],
    });
    const result = await scorer.score(dataset);
    // (1.0 + 0.0) / 2 = 0.5
    expect(result.score).toBe(0.5);
    expect(result.evidence!.accessible).toBe(1);
    expect(result.evidence!.checked).toBe(2);
  });

  it("scores zero resources as 0", async () => {
    const result = await scorer.score(makeMinimalDataset());
    expect(result.score).toBe(0);
    expect(result.evidence!.resourceCount).toBe(0);
  });

  it("handles timeout as 0", async () => {
    const fastScorer = new AccessibilityScorer({ headTimeoutMs: 100, concurrency: 5 });
    const dataset = makeMinimalDataset({
      resources: [resource("/slow")],
    });
    const result = await fastScorer.score(dataset);
    expect(result.score).toBe(0);
    expect(result.evidence!.checked).toBe(1);
    expect(result.evidence!.accessible).toBe(0);
  });

  it("counts accessible resources in evidence", async () => {
    const dataset = makeMinimalDataset({
      resources: [resource("/ok"), resource("/redirect"), resource("/not-found")],
    });
    const result = await scorer.score(dataset);
    expect(result.evidence!.resourceCount).toBe(3);
    expect(result.evidence!.checked).toBe(3);
    expect(result.evidence!.accessible).toBe(2); // ok (1.0) + redirect (0.9) >= 0.9
  });

  it("respects concurrency limit", async () => {
    // 10 resources with concurrency=2 — all should complete
    const limScorer = new AccessibilityScorer({ headTimeoutMs: 2000, concurrency: 2 });
    const dataset = makeMinimalDataset({
      resources: Array.from({ length: 10 }, () => resource("/ok")),
    });
    const result = await limScorer.score(dataset);
    expect(result.score).toBe(1.0);
    expect(result.evidence!.checked).toBe(10);
  });
});
