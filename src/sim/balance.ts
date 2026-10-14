/**
 * Balance report. Plays many seeded runs with the bots and prints win rates, how far runs get and
 * which creatures over- or under-perform.
 *
 *   npm run balance                    default sample
 *   npm run balance -- 400 greedy      400 runs per difficulty with the greedy bot
 */
import { SPECIES_LIST } from "../engine/data.js";
import { TUNING } from "../engine/enemy.js";
import { newRun } from "../engine/run.js";
import { DIFFICULTIES } from "../engine/types.js";
import { type Skill, playRun } from "./bots.js";

const n = Number(process.argv[2] ?? 200);
const skill = (process.argv[3] ?? "greedy") as Skill;
if (process.argv[4]) TUNING.scale = Number(process.argv[4]);

console.log(`Balance report: ${n} runs per difficulty, ${skill} bot, enemy power x${TUNING.scale}\n`);
for (const difficulty of DIFFICULTIES) {
  let wins = 0;
  const reached = new Map<number, number>();
  const usage = new Map<string, { n: number; wins: number }>();
  const byRound = new Map<number, { w: number; l: number; d: number }>();
  const power = new Map<number, { me: number; foe: number; n: number }>();
  for (let seed = 1; seed <= n; seed++) {
    const { log, run } = playRun(newRun(seed * 7919, difficulty), skill);
    if (log.won) wins++;
    reached.set(run.round, (reached.get(run.round) ?? 0) + 1);
    for (const f of log.fights) {
      const br = byRound.get(f.round) ?? { w: 0, l: 0, d: 0 };
      if (f.outcome === "win") br.w++; else if (f.outcome === "lose") br.l++; else br.d++;
      byRound.set(f.round, br);
      const pw = power.get(f.round) ?? { me: 0, foe: 0, n: 0 };
      pw.me += f.power; pw.foe += f.enemyPower; pw.n++;
      power.set(f.round, pw);
      if (f.round < 5) continue;
      for (const sp of new Set(f.species)) {
        const e = usage.get(sp) ?? { n: 0, wins: 0 };
        e.n++;
        if (f.outcome === "win") e.wins++;
        usage.set(sp, e);
      }
    }
  }
  const dist = [...reached.entries()].sort((a, b) => a[0] - b[0]).map(([r, c]) => `R${r}:${Math.round((c / n) * 100)}%`).join(" ");
  console.log(`${difficulty.padEnd(9)} run win rate ${((wins / n) * 100).toFixed(1).padStart(5)}%   ended at: ${dist}`);
  console.log("   round outcomes: " + [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([r, o]) => { const t = o.w + o.l + o.d; return `R${r} ${Math.round((o.w / t) * 100)}w/${Math.round((o.l / t) * 100)}l/${Math.round((o.d / t) * 100)}d`; }).join("  "));
  console.log("   power me/foe:   " + [...power.entries()].sort((a, b) => a[0] - b[0]).map(([r, p]) => `R${r} ${Math.round(p.me / p.n)}/${Math.round(p.foe / p.n)}`).join("  "));
  if (difficulty === "knight" && process.argv[5] !== "brief") {
    const rows = SPECIES_LIST.map((s) => ({ s, e: usage.get(s.id) ?? { n: 0, wins: 0 } })).sort((a, b) => b.e.wins / Math.max(1, b.e.n) - a.e.wins / Math.max(1, a.e.n));
    const total = [...usage.values()].reduce((a, b) => a + b.n, 0);
    console.log("\n  creature winrate (battles from round 5, knight):");
    for (const { s, e } of rows) console.log(`   ${s.name.padEnd(20)} T${s.tier} ${s.faction.padEnd(9)} used ${String(e.n).padStart(5)} (${((e.n / Math.max(1, total)) * 100).toFixed(1)}%)  win ${e.n ? ((e.wins / e.n) * 100).toFixed(0) : "-"}%`);
    console.log("");
  }
}
