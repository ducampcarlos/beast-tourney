// Bundles the game into docs/game.js. The rest of docs/ (index.html, assets/) is the site itself,
// served by GitHub Pages from the main branch's /docs folder.
//
//   node scripts/build.mjs            one-off build
//   node scripts/build.mjs --watch    rebuild on change and serve on http://localhost:8000
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build, context } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [join(root, "src/web/main.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  outfile: join(docs, "game.js"),
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: docs, port: 8000 });
  console.log(`Serving on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
} else {
  await build(options);
}
