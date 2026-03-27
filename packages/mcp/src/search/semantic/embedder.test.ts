import { describe, it, expect, vi, beforeEach } from "vitest";
import { TransformersEmbedder } from "./embedder.js";
import type { Logger } from "../../logger.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop };

// Mock extractor function returned by pipeline()
function createMockExtractor(dims: number) {
  return vi.fn(
    async (
      input: string | string[],
      _options: { pooling: string; normalize: boolean },
    ) => {
      const count = Array.isArray(input) ? input.length : 1;
      // Fill with deterministic values: item index * dims + dimension index
      const data = new Float32Array(count * dims);
      for (let i = 0; i < count; i++) {
        for (let d = 0; d < dims; d++) {
          data[i * dims + d] = i + d * 0.001;
        }
      }
      return { data, dims: [count, dims] };
    },
  );
}

// Mock the dynamic import of @huggingface/transformers
vi.mock("@huggingface/transformers", () => {
  const extractor = createMockExtractor(384);
  return {
    pipeline: vi.fn(async () => extractor),
    __extractor: extractor,
  };
});

describe("TransformersEmbedder", () => {
  let embedder: TransformersEmbedder;

  beforeEach(() => {
    vi.clearAllMocks();
    embedder = new TransformersEmbedder(logger);
  });

  it("returns correct dimensions", () => {
    expect(embedder.dimensions()).toBe(384);
  });

  it("embed() returns a vector of correct length", async () => {
    const result = await embedder.embed("hello world");
    expect(result).toHaveLength(384);
    expect(typeof result[0]).toBe("number");
  });

  it("embedBatch() returns vectors for each input", async () => {
    const texts = ["hello", "world", "test"];
    const results = await embedder.embedBatch(texts);

    expect(results).toHaveLength(3);
    for (const vec of results) {
      expect(vec).toHaveLength(384);
    }
  });

  it("embedBatch() with empty array returns empty", async () => {
    const results = await embedder.embedBatch([]);
    expect(results).toEqual([]);
  });

  it("pipeline is created only once (singleton)", async () => {
    const { pipeline } = await import("@huggingface/transformers");

    await embedder.embed("first");
    await embedder.embed("second");

    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it("embedBatch() chunks large inputs", async () => {
    // Create embedder with batchSize=2
    const smallBatchEmbedder = new TransformersEmbedder(
      logger,
      "Xenova/all-MiniLM-L6-v2",
      384,
      2,
    );

    const texts = ["a", "b", "c", "d", "e"];
    const results = await smallBatchEmbedder.embedBatch(texts);

    expect(results).toHaveLength(5);

    // The mock extractor should have been called 3 times (2+2+1)
    const { pipeline } = await import("@huggingface/transformers");
    const mockPipeline = pipeline as unknown as ReturnType<typeof vi.fn>;
    const extractor = await mockPipeline.mock.results[0].value;
    expect(extractor).toHaveBeenCalledTimes(3);
  });

  it("pipeline failure resets promise for retry", async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const mockPipeline = pipeline as unknown as ReturnType<typeof vi.fn>;

    // Make pipeline fail on next call
    mockPipeline.mockRejectedValueOnce(new Error("download failed"));

    const failEmbedder = new TransformersEmbedder(logger);
    await expect(failEmbedder.embed("test")).rejects.toThrow("download failed");

    // Reset mock to succeed
    mockPipeline.mockResolvedValueOnce(createMockExtractor(384));

    // Should retry (pipeline called again)
    const result = await failEmbedder.embed("retry");
    expect(result).toHaveLength(384);
  });
});
