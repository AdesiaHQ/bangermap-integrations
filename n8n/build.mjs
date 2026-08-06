import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const engine = fileURLToPath(new URL("../src/lib", import.meta.url));

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["n8n-workflow"],
  alias: { "@engine": engine },
  logLevel: "info",
};

await rm("dist", { recursive: true, force: true });

await build({
  ...shared,
  entryPoints: ["nodes/Bangermap/Bangermap.node.ts"],
  outfile: "dist/nodes/Bangermap/Bangermap.node.js",
});

await build({
  ...shared,
  entryPoints: ["credentials/BangermapApi.credentials.ts"],
  outfile: "dist/credentials/BangermapApi.credentials.js",
});

await mkdir("dist/nodes/Bangermap", { recursive: true });
await cp("nodes/Bangermap/bangermap.svg", "dist/nodes/Bangermap/bangermap.svg");
await cp("nodes/Bangermap/Bangermap.node.json", "dist/nodes/Bangermap/Bangermap.node.json");
