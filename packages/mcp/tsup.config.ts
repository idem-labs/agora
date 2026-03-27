import { defineConfig } from "tsup";
import { cp } from "node:fs/promises";
import { join } from "node:path";

export default defineConfig({
  entry: ["src/index.ts", "src/lib.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node20",
  // Bundle @agora/sdk (workspace dep, not published to npm separately)
  noExternal: ["@agora/sdk"],
  // Copy language packs and acronym packs to dist/
  // (loaded at runtime via readFile + __dirname)
  async onSuccess() {
    const src = join("src", "search", "fts");
    const dest = "dist";
    await cp(join(src, "lang"), join(dest, "lang"), { recursive: true });
    await cp(join(src, "acronyms"), join(dest, "acronyms"), {
      recursive: true,
    });
    console.log("Copied language packs to dist/");
  },
});
