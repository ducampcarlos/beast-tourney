// End-to-end tests: drive the REAL built game (docs/) in a real Chromium, with the mouse.
//
//   npm run build && npm run test:e2e
//
// Set CHROME_PATH to use a specific browser binary; otherwise Playwright's own Chromium is used
// (`npx playwright-core install chromium`). Set ONLY="some words" to run just the tests whose name has them.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const docs = join(root, "docs");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ogg": "audio/ogg", ".ttf": "font/ttf" };

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;
  const path = normalize(pathname === "/" ? "/index.html" : pathname);
  if (path.includes("..")) return void res.writeHead(400).end();
  try {
    const body = await readFile(join(docs, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });

let passed = 0;
const failures = [];
const problems = [];

async function newPage(query = "?debug&nohelp", options = {}) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, ...options });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console.error: ${m.text()}`));
  await page.goto(base + query);
  await scene(page, "Menu");
  return page;
}

async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const before = problems.length;
  try {
    await fn();
    assert.equal(problems.length, before, `unexpected browser errors: ${problems.slice(before).join(" | ")}`);
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(error.stack ?? error.message).split("\n").slice(0, 7).join("\n       ")}`);
  }
}

// ---- helpers ----------------------------------------------------------------------------------
const scene = (page, key, timeout = 15000) => page.waitForFunction((k) => window.__tourney?.game?.scene?.isActive(k), key, { timeout });
/** Switch scene the way the game does (the running scene starts the next one, which stops it). */
const go = (page, key, data) =>
  page.evaluate(({ key, data }) => {
    const t = window.__tourney;
    t.game.scene.getScenes(true)[0].scene.start(key, data);
  }, { key, data });
const run = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__tourney.session.run)));
const inject = (page, patch) =>
  page.evaluate((p) => {
    const t = window.__tourney;
    t.session.update({ ...t.session.run, ...p });
    t.game.scene.getScene("Shop").scene.restart();
  }, patch).then(() => page.waitForTimeout(250));
const unit = (uid, sp, atk, hp, level = 1, exp = 0, relic) => ({ uid, sp, atk, hp, level, exp, ...(relic ? { relic } : {}) });
const team = (...units) => [...units, ...Array(5 - units.length).fill(null)];

// layout, mirrored from shop.ts
const slotXY = (i) => ({ x: 24 + 64 + (4 - i) * 136, y: 178 });
const cardXY = (i) => ({ x: 42 + 60 + i * 128, y: 366 });
const RELIC = [{ x: 768, y: 442 }, { x: 868, y: 442 }];
const ROLL = { x: 118, y: 514 };
const FIGHT = { x: 826, y: 514 };
const SELL_SPOT = { x: 350, y: 390 };

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}
const click = async (page, p) => {
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(250);
};
async function startRun(page, seed = 12, difficulty = "knight") {
  await page.evaluate(({ seed, difficulty }) => {
    const t = window.__tourney;
    t.session.start(difficulty, seed);
    t.game.scene.getScenes(true)[0].scene.start("Shop");
  }, { seed, difficulty });
  await scene(page, "Shop");
  await page.waitForTimeout(300);
}
async function finishBattle(page) {
  await scene(page, "Battle");
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__tourney.battle.skip());
  await page.waitForFunction(() => window.__tourney.battle?.finished(), null, { timeout: 30000 });
  await page.waitForTimeout(700);
}

console.log("Beast Tourney end-to-end");

// ---- tests ------------------------------------------------------------------------------------

await test("loads to the menu with the title and no errors", async () => {
  const page = await newPage();
  assert.equal(await page.title(), "Beast Tourney");
  assert.equal(await page.locator("#boot").count(), 0); // the loading text is gone
  const canvas = await page.locator("canvas").boundingBox();
  assert.ok(canvas.width > 900 && canvas.height > 500);
  await page.context().close();
});

await test("starts a run from the menu with the mouse", async () => {
  const page = await newPage("?debug&nohelp&seed=12");
  await click(page, { x: 480, y: 322 }); // New Run
  await scene(page, "Shop");
  const r = await run(page);
  assert.equal(r.seed, 12);
  assert.equal(r.round, 1);
  assert.equal(r.gold, 10);
  assert.equal(r.difficulty, "knight");
  assert.equal(r.offers.length, 3);
  await page.context().close();
});

await test("difficulty buttons change the rank, and lives follow", async () => {
  const page = await newPage("?debug&nohelp&seed=3");
  await click(page, { x: 330, y: 218 }); // Squire
  await click(page, { x: 480, y: 322 });
  await scene(page, "Shop");
  assert.deepEqual([(await run(page)).difficulty, (await run(page)).lives], ["squire", 5]);
  await page.context().close();
});

await test("buys by dragging a creature onto the board, and spends 3 gold", async () => {
  const page = await newPage();
  await startRun(page);
  const before = await run(page);
  await drag(page, cardXY(0), slotXY(0));
  const after = await run(page);
  assert.equal(after.gold, 7);
  assert.equal(after.team[0].sp, before.offers[0].sp);
  assert.equal(after.offers[0], null);
  await page.context().close();
});

await test("refuses to buy onto a different creature, without spending anything", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { offers: [{ sp: "wolf", frozen: false }, { sp: "boar", frozen: false }, { sp: "bear", frozen: false }] });
  await drag(page, cardXY(0), slotXY(0));
  await drag(page, cardXY(1), slotXY(0)); // different species on an occupied slot
  const r = await run(page);
  assert.equal(r.team[0].sp, "wolf");
  assert.equal(r.gold, 7);
  assert.equal(r.offers[1].sp, "boar");
  await page.context().close();
});

await test("dropping a creature outside any slot leaves everything as it was", async () => {
  const page = await newPage();
  await startRun(page);
  const before = await run(page);
  await drag(page, cardXY(0), { x: 400, y: 60 });
  assert.deepEqual(await run(page), before);
  await page.context().close();
});

await test("merges three of a kind into a level 2 creature", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { offers: [{ sp: "wolf", frozen: false }, { sp: "wolf", frozen: false }, { sp: "wolf", frozen: false }], gold: 10 });
  await drag(page, cardXY(0), slotXY(0));
  await drag(page, cardXY(1), slotXY(0));
  let r = await run(page);
  assert.deepEqual([r.team[0].level, r.team[0].exp, r.team[0].atk, r.team[0].hp], [1, 1, 3, 4]);
  await drag(page, cardXY(2), slotXY(0));
  r = await run(page);
  assert.deepEqual([r.team[0].level, r.team[0].exp], [2, 2]);
  assert.equal(r.gold, 1);
  await page.context().close();
});

await test("rearranges the team by dragging, swapping neighbours", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { team: team(unit(1, "wolf", 2, 3), unit(2, "boar", 3, 4)), nextUid: 10 });
  await drag(page, slotXY(0), slotXY(1));
  const r = await run(page);
  assert.deepEqual([r.team[0].sp, r.team[1].sp], ["boar", "wolf"]);
  await drag(page, slotXY(1), slotXY(4)); // into an empty slot
  assert.deepEqual((await run(page)).team.map((u) => u?.sp ?? null), ["boar", null, null, null, "wolf"]);
  await page.context().close();
});

await test("sells by dragging onto the shop, for the creature's level in gold", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { team: team(unit(1, "wolf", 4, 5, 2, 2)), nextUid: 10, gold: 5 });
  await drag(page, slotXY(0), SELL_SPOT);
  const r = await run(page);
  assert.equal(r.team[0], null);
  assert.equal(r.gold, 7);
  await page.context().close();
});

await test("selecting a creature offers a Sell button", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { team: team(unit(1, "wolf", 2, 3)), nextUid: 10, gold: 0 });
  await click(page, slotXY(0));
  await click(page, { x: 830, y: 382 }); // Sell
  const r = await run(page);
  assert.equal(r.team[0], null);
  assert.equal(r.gold, 1);
  await page.context().close();
});

await test("rolls with the button and with R, never below zero gold", async () => {
  const page = await newPage();
  await startRun(page);
  await click(page, ROLL);
  assert.equal((await run(page)).gold, 9);
  await page.keyboard.press("r");
  await page.waitForTimeout(250);
  assert.equal((await run(page)).gold, 8);
  await inject(page, { gold: 0 });
  await click(page, ROLL);
  assert.equal((await run(page)).gold, 0);
  await page.context().close();
});

await test("freezes an offer so a roll keeps it", async () => {
  const page = await newPage();
  await startRun(page);
  const kept = (await run(page)).offers[1].sp;
  await click(page, { x: cardXY(1).x + 44, y: 320 }); // the little lock
  assert.equal((await run(page)).offers[1].frozen, true);
  for (let i = 0; i < 3; i++) await click(page, ROLL);
  const r = await run(page);
  assert.equal(r.offers[1].sp, kept);
  assert.equal(r.gold, 7);
  await page.context().close();
});

await test("equips a relic by dragging it onto a creature, and by click then click", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { round: 2, gold: 10, team: team(unit(1, "wolf", 2, 3), unit(2, "boar", 3, 4)), nextUid: 10, relics: [{ id: "whetstone", frozen: false }, { id: "aegis", frozen: false }] });
  await drag(page, RELIC[0], slotXY(0));
  let r = await run(page);
  assert.equal(r.team[0].relic, "whetstone");
  assert.equal(r.gold, 7);
  await click(page, RELIC[1]); // select
  await click(page, slotXY(1)); // then the creature
  r = await run(page);
  assert.equal(r.team[1].relic, "aegis");
  assert.equal(r.gold, 3);
  await page.context().close();
});

await test("fights a battle to the end and comes back to a fresh shop", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { team: team(unit(1, "mammoth", 20, 60), unit(2, "bear", 9, 30)), nextUid: 10, gold: 1 });
  await click(page, FIGHT);
  await finishBattle(page);
  const outcome = await page.evaluate(() => window.__tourney.battle.result().battle.outcome);
  assert.equal(outcome, "win");
  await click(page, { x: 480, y: 392 }); // Continue
  await scene(page, "Shop");
  const r = await run(page);
  assert.equal(r.round, 2);
  assert.equal(r.wins, 1);
  assert.equal(r.gold, 10);
  assert.equal(r.relics.length, 2);
  await page.context().close();
});

await test("plays a battle in real time (not skipped) and the speed button works", async () => {
  const page = await newPage();
  await startRun(page);
  await inject(page, { team: team(unit(1, "mammoth", 20, 60)), nextUid: 10 });
  await click(page, FIGHT);
  await scene(page, "Battle");
  await page.waitForTimeout(500);
  await click(page, { x: 770, y: 26 }); // Speed x2
  await click(page, { x: 770, y: 26 }); // x4
  await page.waitForFunction(() => window.__tourney.battle?.finished(), null, { timeout: 40000 });
  await page.context().close();
});

await test("a lost run ends on the elimination screen, which can start over or return to the menu", async () => {
  const page = await newPage();
  await startRun(page, 5, "champion");
  await inject(page, { lives: 1, team: team(unit(1, "squirrel", 1, 1)), nextUid: 10 });
  await click(page, FIGHT);
  await finishBattle(page);
  await click(page, { x: 480, y: 392 });
  await scene(page, "End");
  assert.equal((await page.evaluate(() => window.__tourney.session.run?.phase)), "lost");
  await click(page, { x: 330, y: 450 }); // New Run
  await scene(page, "Shop");
  const r = await run(page);
  assert.deepEqual([r.round, r.lives, r.phase, r.difficulty], [1, 3, "shop", "champion"]);
  await page.context().close();
});

await test("winning the final boss ends in a victory screen and records the result", async () => {
  const page = await newPage();
  await startRun(page, 8, "squire");
  const giants = Array.from({ length: 5 }, (_, i) => unit(i + 1, "mammoth", 90, 900));
  await inject(page, { round: 12, team: giants, nextUid: 20 });
  await click(page, FIGHT);
  await finishBattle(page);
  await click(page, { x: 480, y: 392 });
  await scene(page, "End");
  const best = await page.evaluate(() => window.__tourney.session.profile.best.squire);
  assert.deepEqual(best, { round: 12, wins: 1 });
  await page.context().close();
});

await test("continues a saved run after a reload", async () => {
  const page = await newPage("?debug&nohelp&seed=21");
  await click(page, { x: 480, y: 322 });
  await scene(page, "Shop");
  await drag(page, cardXY(0), slotXY(0));
  const saved = await run(page);
  await page.reload();
  await scene(page, "Menu");
  await page.waitForTimeout(300);
  await click(page, { x: 480, y: 376 }); // Continue
  await scene(page, "Shop");
  assert.deepEqual(await run(page), saved);
  await page.context().close();
});

await test("ignores a corrupted save instead of crashing", async () => {
  const page = await newPage();
  await page.evaluate(() => {
    localStorage.setItem("beast-tourney.run.v1", '{"v":1,"team":"nope"}');
    localStorage.setItem("beast-tourney.profile.v1", "{{{{");
  });
  await page.reload();
  await scene(page, "Menu");
  assert.equal(await page.evaluate(() => window.__tourney.session.hasSavedRun()), false);
  await page.context().close();
});

await test("the bestiary shows creatures once met, and silhouettes before", async () => {
  const page = await newPage();
  await startRun(page, 12);
  const seen = await page.evaluate(() => window.__tourney.session.profile.seen.length);
  assert.ok(seen >= 3, `expected some creatures met, got ${seen}`);
  await go(page, "Bestiary");
  await scene(page, "Bestiary");
  await click(page, { x: 880, y: 27 }); // Back
  await scene(page, "Menu");
  await page.context().close();
});

await test("shows the how-to-play panel once, on the first run, and never again", async () => {
  const page = await newPage("?debug");
  await click(page, { x: 480, y: 322 });
  await scene(page, "Shop");
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__tourney.session.profile.seenHelp), true);
  // the panel sits on top: a click on the board does nothing until it is dismissed
  await click(page, { x: 480, y: 480 }); // Got it
  await page.waitForTimeout(200);
  await page.reload();
  await scene(page, "Menu");
  await click(page, { x: 480, y: 322 });
  await scene(page, "Shop");
  await page.waitForTimeout(700);
  // nothing covers the board this time: a drag buys
  await drag(page, cardXY(0), slotXY(0));
  assert.equal((await run(page)).gold, 7);
  await page.context().close();
});

await test("the menu has working How to play and Credits panels", async () => {
  const page = await newPage();
  await click(page, { x: 380, y: 470 }); // How to play
  await click(page, { x: 480, y: 480 }); // Got it
  await click(page, { x: 580, y: 470 }); // Credits
  await click(page, { x: 480, y: 480 });
  await click(page, { x: 480, y: 322 }); // the menu is usable again
  await scene(page, "Shop");
  await page.context().close();
});

await test("remembers the sound setting", async () => {
  const page = await newPage();
  await click(page, { x: 580, y: 424 }); // Sound toggle
  assert.equal(await page.evaluate(() => window.__tourney.audio.muted), true);
  await page.reload();
  await scene(page, "Menu");
  assert.equal(await page.evaluate(() => window.__tourney.audio.muted), true);
  await page.context().close();
});

await test("plays a whole tournament through the UI without a single error", async () => {
  const page = await newPage("?debug&nohelp");
  await startRun(page, 99, "squire");
  const giants = Array.from({ length: 5 }, (_, i) => unit(i + 1, "mammoth", 90, 900));
  for (let round = 1; round <= 12; round++) {
    await inject(page, { round, team: giants, nextUid: 20, gold: 10 });
    await click(page, FIGHT);
    await finishBattle(page);
    await click(page, { x: 480, y: 392 });
    if (round < 12) await scene(page, "Shop");
  }
  await scene(page, "End");
  assert.equal((await run(page)).phase, "won");
  await page.context().close();
});

await test("fits any window: the canvas keeps its aspect and stays on screen", async () => {
  for (const [w, h] of [[390, 844], [1920, 1080], [1024, 600]]) {
    const page = await newPage("?debug&nohelp", { viewport: { width: w, height: h } });
    const box = await page.locator("canvas").boundingBox();
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= w + 1 && box.y + box.height <= h + 1, `${w}x${h}: canvas ${JSON.stringify(box)}`);
    assert.ok(Math.abs(box.width / box.height - 960 / 540) < 0.02, `${w}x${h}: aspect ${box.width / box.height}`);
    await page.context().close();
  }
});

await test("works with a finger: double tap buys, tap selects", async () => {
  const page = await newPage("?debug&nohelp", { viewport: { width: 960, height: 540 }, hasTouch: true });
  await startRun(page);
  const first = (await run(page)).offers[0].sp;
  await page.touchscreen.tap(cardXY(0).x, cardXY(0).y);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(cardXY(0).x, cardXY(0).y);
  await page.waitForTimeout(400);
  const r = await run(page);
  assert.equal(r.team.find((u) => u)?.sp, first);
  assert.equal(r.gold, 7);
  await page.context().close();
});

await test("the same seed deals the same first shop, on every device", async () => {
  const a = await newPage("?debug&nohelp");
  await startRun(a, 777);
  const offersA = (await run(a)).offers.map((o) => o.sp);
  const b = await newPage("?debug&nohelp");
  await startRun(b, 777);
  assert.deepEqual((await run(b)).offers.map((o) => o.sp), offersA);
  await a.context().close();
  await b.context().close();
});

await test("no console errors or uncaught exceptions anywhere", () => {
  assert.deepEqual(problems, []);
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
