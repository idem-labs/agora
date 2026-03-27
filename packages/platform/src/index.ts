import { VERSION } from "@agora/sdk";
import { loadPipelineConfig } from "./config.js";
import { runPipeline } from "./pipeline.js";

console.log(`Ágora Platform v${VERSION}`);

const config = loadPipelineConfig();
runPipeline(config).catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
