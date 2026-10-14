/**
 * Bots that play full runs through the same commands the UI uses. They exist to calibrate the
 * difficulty and to stress the engine; they are decent, not perfect.
 */

import { RELICS, relic as relicDef, species as speciesDef } from "../engine/data.js";
import { Rng, hashSeed } from "../engine/rng.js";
import { BUY_COST, type Result, type Run, buy, buyRelic, fight, move, roll, sell, teamUnits } from "../engine/run.js";
import { type FactionId, SLOTS, type Unit } from "../engine/types.js";

export type Skill = "random" | "greedy";

const factionsOnTeam = (run: Run): Map<FactionId, Set<string>> => {
  const map = new Map<FactionId, Set<string>>();
  for (const u of teamUnits(run)) {
    const f = speciesDef(u.sp).faction;
    (map.get(f) ?? map.set(f, new Set()).get(f)!).add(u.sp);
  }
  return map;
};

/** The faction the bot is building around: the one with the most distinct species on the team. */
function focus(run: Run): FactionId | null {
  const map = factionsOnTeam(run);
  let best: FactionId | null = null;
  let count = 0;
  for (const [f, set] of map) {
    if (set.size > count) {
      best = f;
      count = set.size;
    }
  }
  return count >= 2 ? best : null;
}

/** How much the bot wants a species for the current team. */
function want(run: Run, spId: string): number {
  const sp = speciesDef(spId);
  const map = factionsOnTeam(run);
  const have = map.get(sp.faction);
  const inTeam = have?.has(spId) ?? false;
  const f = focus(run);
  let score = sp.atk + sp.hp + sp.tier * 2 + (sp.ability ? 3 : 0);
  if (inTeam) score += 8; // merges are worth chasing
  else if (have) score += 3 + have.size * 3; // a new species of a faction already on the team brings a bond closer
  if (f && sp.faction === f) score += 5;
  if (f && sp.faction !== f && (map.get(f)?.size ?? 0) >= 3) score -= 5;
  return score;
}

/** Keep units that are carrying a bond, and units that are strong. */
function worth(run: Run, u: Unit): number {
  const sp = speciesDef(u.sp);
  const map = factionsOnTeam(run);
  const size = map.get(sp.faction)?.size ?? 0;
  const f = focus(run);
  return (u.atk + u.hp) * (1 + (u.level - 1) * 0.6) + (sp.ability ? 3 : 0) + (size >= 2 ? 3 + size * 2 : 0) + (f === sp.faction ? 4 : 0) + (u.relic ? 3 : 0);
}

const ok = (r: Result, run: Run): Run => (r.ok ? r.run : run);

function playGreedy(start: Run): Run {
  let run = start;
  for (let guard = 0; guard < 60; guard++) {
    const before = JSON.stringify([run.gold, run.team, run.offers, run.relics]);

    // 1. merges
    let acted = false;
    for (let i = 0; i < run.offers.length && !acted; i++) {
      const offer = run.offers[i];
      if (!offer || run.gold < BUY_COST) continue;
      const slot = run.team.findIndex((u) => u?.sp === offer.sp);
      if (slot >= 0) {
        const r = buy(run, i, slot);
        if (r.ok) (run = r.run), (acted = true);
      }
    }
    if (acted) continue;

    // 2. best affordable creature
    if (run.gold >= BUY_COST) {
      const ranked = run.offers.map((o, i) => ({ o, i })).filter((x) => x.o).sort((a, b) => want(run, b.o!.sp) - want(run, a.o!.sp));
      const best = ranked[0];
      if (best) {
        const empty = run.team.findIndex((u) => u === null);
        if (empty >= 0) {
          run = ok(buy(run, best.i, empty), run);
          continue;
        }
        const units = run.team.map((u, i) => ({ u: u!, i })).sort((a, b) => worth(run, a.u) - worth(run, b.u));
        const weakest = units[0]!;
        if (want(run, best.o!.sp) > worth(run, weakest.u) + 2) {
          const sold = sell(run, weakest.i);
          if (sold.ok) {
            run = ok(buy(sold.run, best.i, weakest.i), sold.run);
            continue;
          }
        }
      }
    }

    // 3. relics: put them on the strongest unit without one
    const relicTargets = run.team.map((u, i) => ({ u, i })).filter((x) => x.u && !x.u.relic).sort((a, b) => worth(run, b.u!) - worth(run, a.u!));
    const wantRelic = run.relics.map((r, i) => ({ r, i })).filter((x) => x.r && run.gold >= relicDef(x.r.id).cost && relicTargets.length > 0);
    if (wantRelic.length > 0 && run.gold - relicDef(wantRelic[0]!.r!.id).cost >= 0) {
      const pick = wantRelic.sort((a, b) => relicDef(b.r!.id).cost - relicDef(a.r!.id).cost)[0]!;
      run = ok(buyRelic(run, pick.i, relicTargets[0]!.i), run);
      if (JSON.stringify([run.gold, run.team, run.offers, run.relics]) !== before) continue;
    }

    // 4. spend the remainder on rolls, but keep enough for a purchase
    if (run.gold >= BUY_COST + 1 && run.team.some((u) => u === null)) {
      run = ok(roll(run), run);
    } else if (run.gold >= BUY_COST + 2) {
      run = ok(roll(run), run);
    }
    if (JSON.stringify([run.gold, run.team, run.offers, run.relics]) === before) break;
  }
  return arrange(run);
}

/** Tanky units to the front. */
function arrange(run: Run): Run {
  const units = teamUnits(run).sort((a, b) => b.hp - a.hp);
  const team: (Unit | null)[] = Array<Unit | null>(SLOTS).fill(null);
  units.forEach((u, i) => (team[i] = u));
  return { ...run, team };
}

function playRandom(start: Run, rng: Rng): Run {
  let run = start;
  for (let i = 0; i < 12; i++) {
    const choice = rng.int(4);
    if (choice === 0) run = ok(roll(run), run);
    else if (choice === 1 && run.offers.length > 0) run = ok(buy(run, rng.int(run.offers.length), rng.int(SLOTS)), run);
    else if (choice === 2) run = ok(sell(run, rng.int(SLOTS)), run);
    else run = ok(move(run, rng.int(SLOTS), rng.int(SLOTS)), run);
  }
  if (teamUnits(run).length === 0) run = ok(buy(run, 0, 0), run);
  return run;
}

export interface RunLog {
  finalRound: number;
  won: boolean;
  /** Species on the team in each battle, with the outcome, for pick-rate statistics. */
  fights: Array<{ round: number; outcome: string; species: string[]; power: number; enemyPower: number }>;
}

export function playRun(start: Run, skill: Skill, botSeed = 1): { run: Run; log: RunLog } {
  const rng = new Rng(hashSeed(start.seed, botSeed));
  let run = start;
  const log: RunLog = { finalRound: 1, won: false, fights: [] };
  for (let turn = 0; turn < 60 && run.phase === "shop"; turn++) {
    run = skill === "greedy" ? playGreedy(run) : playRandom(run, rng);
    const species = teamUnits(run).map((u) => u.sp);
    const round = run.round;
    const r = fight(run);
    if (!r.ok) {
      if (teamUnits(run).length === 0) break;
      throw new Error(r.error);
    }
    const sum = (us: Unit[]) => us.reduce((a, u) => a + u.atk + u.hp, 0);
    log.fights.push({ round, outcome: r.battle.outcome, species, power: sum(teamUnits(run)), enemyPower: sum(r.enemy) });
    run = r.run;
  }
  log.finalRound = run.round;
  log.won = run.phase === "won";
  return { run, log };
}

export { RELICS };

/** Exposed for debugging scripts: one bot shop turn. */
export const playTurnForDebug = (run: Run): { run: Run } => ({ run: playGreedy(run) });
