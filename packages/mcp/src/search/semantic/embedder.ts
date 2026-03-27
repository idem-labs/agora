import type { Logger } from "../../logger.js";

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions(): number;
}

type ExtractorFn = (
  texts: string | string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Wraps @huggingface/transformers feature-extraction pipeline.
 * Lazy-loads the model on first use (~90MB download on first run).
 */
export class TransformersEmbedder implements Embedder {
  private pipelinePromise: Promise<ExtractorFn> | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly model: string = "Xenova/all-MiniLM-L6-v2",
    private readonly dims: number = 384,
    private readonly batchSize: number = 64,
  ) {}

  dimensions(): number {
    return this.dims;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const extractor = await this.getPipeline();
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const chunk = texts.slice(i, i + this.batchSize);
      const output = await extractor(chunk, {
        pooling: "mean",
        normalize: true,
      });
      const data = output.data;
      const d = this.dims;
      for (let j = 0; j < chunk.length; j++) {
        results.push(Array.from(data.subarray(j * d, (j + 1) * d)));
      }
    }

    return results;
  }

  private getPipeline(): Promise<ExtractorFn> {
    if (!this.pipelinePromise) {
      this.logger.info(
        "Embedder: loading model (first run may download ~90MB)",
        { model: this.model },
      );
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  private async loadPipeline(): Promise<ExtractorFn> {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const extractor = await pipeline("feature-extraction", this.model, {
        dtype: "fp32",
      });
      this.logger.info("Embedder: model loaded", { model: this.model });
      return extractor as unknown as ExtractorFn;
    } catch (error) {
      // Reset so next call retries
      this.pipelinePromise = null;
      throw error;
    }
  }
}
