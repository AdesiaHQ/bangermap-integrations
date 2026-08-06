import { cp, rm } from "node:fs/promises";
import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["n8n-workflow"],
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

await cp("nodes/Bangermap/bangermap.svg", "dist/nodes/Bangermap/bangermap.svg");
await cp("nodes/Bangermap/bangermap.dark.svg", "dist/nodes/Bangermap/bangermap.dark.svg");
await cp("nodes/Bangermap/Bangermap.node.json", "dist/nodes/Bangermap/Bangermap.node.json");
await cp("credentials/bangermap.svg", "dist/credentials/bangermap.svg");
await cp("credentials/bangermap.dark.svg", "dist/credentials/bangermap.dark.svg");
