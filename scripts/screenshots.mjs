// Renders the README screenshots from the real, built game (docs/) in Chromium, in states set up
// through the debug hook. Run `npm run build` first.
//
//   CHROME_PATH=/path/to/chromium node scripts/screenshots.mjs

import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const docs = join(root, "docs");
const out = join(root, "assets");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ogg": "audio/ogg", ".ttf": "font/ttf" };

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;
  const path = normalize(pathname === "/" ? "/index.html" : pathname);
  try {
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(join(docs, path)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const unit = (uid, sp, atk, hp, level = 1, exp = 0, relic) => ({ uid, sp, atk, hp, level, exp, ...(relic ? { relic } : {}) });

async function open(query = "?debug&nohelp") {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(base + query);
  await page.waitForFunction(() => window.__tourney?.game?.scene?.isActive("Menu"));
  await page.waitForTimeout(1500);
  return { page, context };
}
const shot = async (page, name) => {
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`wrote assets/${name}.png`);
};
const setRun = (page, patch, difficulty = "knight", seed = 31) =>
  page.evaluate(({ patch, difficulty, seed }) => {
    const t = window.__tourney;
    const run = t.session.start(difficulty, seed);
    t.session.update({ ...run, ...patch });
  }, { patch, difficulty, seed });
const go = (page, key, data) => page.evaluate(({ key, data }) => window.__tourney.game.scene.getScenes(true)[0].scene.start(key, data), { key, data });

// menu
{
  const { page, context } = await open();
  await page.waitForTimeout(2500);
  await shot(page, "menu");
  await context.close();
}

// shop, mid-game, with the details of one creature showing
{
  const { page, context } = await open();
  await setRun(page, {
    round: 9, gold: 12, wins: 7, lives: 4, nextUid: 50, boons: ["purse", "bulwark"],
    team: [unit(1, "wolf", 7, 8, 2, 2, "great-hammer"), unit(2, "stag", 6, 8), unit(3, "bear", 5, 9, 2, 2), unit(4, "tiger", 8, 9), unit(5, "eagle", 6, 7)],
    offers: [{ sp: "gorgon", frozen: false }, { sp: "cyclops", frozen: true }, { sp: "reaper", frozen: false }, { sp: "maneater", frozen: false }, { sp: "gargoyle", frozen: false }],
    relics: [{ id: "merchant-ring", frozen: false }, { id: "rally-blade", frozen: false }],
  });
  await go(page, "Shop");
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__tourney.game.scene.getScene("Shop").setHover({ kind: "unit", slot: 0 }));
  await page.waitForTimeout(400);
  await shot(page, "shop");
  await page.evaluate(() => window.__tourney.game.scene.getScene("Shop").setHover({ kind: "unit", slot: 4 }));
  await context.close();
}

// the reward after a boss
{
  const { page, context } = await open();
  await setRun(page, { round: 5, nextUid: 50, boons: ["tonic"], pendingBoons: ["lucky", "scholar", "bond-sage"] });
  await go(page, "Boon");
  await page.waitForTimeout(1400);
  await shot(page, "boons");
  await context.close();
}

// the records: trophies and run history
{
  const { page, context } = await open();
  await page.evaluate(() => {
    const t = window.__tourney;
    t.session.award(["first-blood", "growing-up", "fully-grown", "better-together", "united-front", "goblin-toppled", "lich-laid-to-rest", "knight-crown", "twice-blessed"]);
    const rec = (ago, d, seed, won, round, wins, team, endless = false) => ({ t: Date.now() - ago, difficulty: d, seed, outcome: won ? "won" : "lost", round, endless, wins, team });
    t.session.profile.records = [rec(3.6e6, "knight", 4821, true, 12, 11, ["mammoth", "dryad", "unicorn", "wyrm", "pegasus"]), rec(8.6e7, "squire", 77, false, 9, 7, ["wolf", "boar", "bear", "tiger"]), rec(1.7e8, "knight", 9, false, 17, 15, ["lich", "skeleton", "zombie", "mummy", "wraith"], true), rec(2.6e8, "champion", 31337, false, 6, 4, ["ember", "droplet", "pebble"])];
    t.session.profile.best.knight = { round: 12, wins: 1 };
    t.session.profile.depth.knight = 17;
  });
  await go(page, "Trophies");
  await page.waitForTimeout(900);
  await shot(page, "trophies");
  await page.evaluate(() => window.__tourney.game.scene.getScene("Trophies").show("runs", window.__tourney.session));
  await page.waitForTimeout(300);
  await shot(page, "runs");
  await context.close();
}

// battle, a few beats in
{
  const { page, context } = await open();
  await setRun(page, {
    round: 6, gold: 4, nextUid: 50,
    team: [unit(1, "wolf", 5, 7, 2, 2), unit(2, "boar", 5, 6), unit(3, "bear", 4, 8, 1, 1, "aegis"), unit(4, "tiger", 6, 6), unit(5, "eagle", 5, 6)],
  });
  await go(page, "Shop");
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__tourney.game.scene.getScene("Shop").doFight());
  await page.waitForTimeout(4300);
  await shot(page, "battle");
  await context.close();
}

// a boss fight
{
  const { page, context } = await open();
  await setRun(page, { round: 8, gold: 4, nextUid: 50, team: [unit(1, "mammoth", 11, 15, 2, 2), unit(2, "dryad", 7, 9, 2, 2), unit(3, "unicorn", 8, 10), unit(4, "wyrm", 10, 12), unit(5, "pegasus", 9, 11, 1, 1, "rally-blade")] });
  await go(page, "Shop");
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__tourney.game.scene.getScene("Shop").doFight());
  await page.waitForTimeout(1900);
  await shot(page, "boss");
  await context.close();
}

// bestiary
{
  const { page, context } = await open();
  await page.evaluate(() => window.__tourney.session.noteSeen(["wolf", "bear", "boar", "tiger", "eagle", "mammoth", "ember", "droplet", "pebble", "gust", "fairy", "mushroom", "leprechaun", "treant", "skeleton", "zombie", "mummy", "lich", "lizard", "viper", "croc", "wyrm", "goblin", "imp", "hag", "giant", "squire", "ranger", "cherub", "pegasus"]));
  await go(page, "Bestiary");
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__tourney.game.scene.getScene("Bestiary").show("lich", true));
  await page.waitForTimeout(300);
  await shot(page, "bestiary");
  await context.close();
}

// victory
{
  const { page, context } = await open();
  await setRun(page, { round: 12, phase: "won", lives: 2, history: Array.from({ length: 12 }, (_, i) => ({ round: i + 1, outcome: "win", boss: [4, 8, 12].includes(i + 1) })), team: [unit(1, "mammoth", 14, 20, 3, 5, "aegis"), unit(2, "dryad", 8, 9, 2, 2), unit(3, "unicorn", 9, 11, 1, 0, "phoenix-tear"), unit(4, "wyrm", 11, 13), unit(5, "pegasus", 12, 14, 2, 2)] });
  await page.evaluate(() => { const t = window.__tourney; t.game.scene.getScenes(true)[0].scene.start("End", { run: t.session.run }); });
  await page.waitForTimeout(1800);
  await shot(page, "victory");
  await context.close();
}

await browser.close();
server.close();
