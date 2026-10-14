// Bundles the game into docs/game.js. The rest of docs/ (index.html, assets/) is the site itself,
// served by GitHub Pages from the main branch's /docs folder.
//
//   node scripts/build.mjs            one-off build
//   node scripts/build.mjs --watch    rebuild on change and serve on http://localhost:8000
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
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

/** The list of files the service worker keeps for offline play, with a version that changes when any of them does. */
async function writePrecache() {
  const files = [];
  async function walk(dir, prefix = "") {
    for (const entry of (await readdir(dir)).sort()) {
      const full = join(dir, entry);
      if ((await stat(full)).isDirectory()) await walk(full, `${prefix}${entry}/`);
      else if (!["precache.json", "sw.js"].includes(prefix + entry)) files.push(prefix + entry);
    }
  }
  await walk(docs);
  const hash = createHash("sha1");
  for (const f of files) hash.update(f).update(await readFile(join(docs, f)));
  files.unshift("./"); // the page itself, as it is asked for
  await writeFile(join(docs, "precache.json"), `${JSON.stringify({ version: hash.digest("hex").slice(0, 10), files }, null, 1)}\n`);
}

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: docs, port: 8000 });
  console.log(`Serving on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
} else {
  await build(options);
  await writePrecache();
}
