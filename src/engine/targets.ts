/** Target selection shared by battles and the shop. Generic over anything with a uid, an attack and a faction. */

import type { Rng } from "./rng.js";
import type { AllyTarget, EnemyTarget, FactionId } from "./types.js";

export interface Slotted {
  uid: number;
  atk: number;
  faction: FactionId;
}

export interface AllyQuery {
  to: AllyTarget;
  count?: number;
  faction?: FactionId;
}

/**
 * Allies an effect lands on. `team` is the owner's side, front first and without the dead.
 * `ownerAt` is where the owner stands, or, if it has just fallen, the slot it fell from
 * (so "ahead" is team[at - 1] and "behind" is team[at]).
 */
export function selectAllies<T extends Slotted>(team: readonly T[], owner: T, alive: boolean, ownerAt: number, query: AllyQuery, rng: Rng): T[] {
  const ahead = team[ownerAt - 1];
  const behind = alive ? team[ownerAt + 1] : team[ownerAt];
  const others = team.filter((t) => t.uid !== owner.uid);
  const n = query.count ?? 1;
  switch (query.to) {
    case "self":
      return alive ? [owner] : [];
    case "ahead":
      return ahead ? [ahead] : [];
    case "behind":
      return behind ? [behind] : [];
    case "adjacent":
      return [ahead, behind].filter((t): t is T => t !== undefined);
    case "all":
      return [...team];
    case "others":
      return others;
    case "random":
      return rng.shuffle(others).slice(0, n);
    case "faction": {
      const f = query.faction ?? owner.faction;
      const members = team.filter((t) => t.faction === f);
      return query.count ? members.slice(0, query.count) : members;
    }
    case "strongest":
      return strongest(others, true).slice(0, 1);
    case "weakest":
      return strongest(others, false).slice(0, 1);
  }
}

function strongest<T extends Slotted>(items: readonly T[], high: boolean): T[] {
  // Stable on position: equal attack keeps the unit nearer the front first.
  return items.map((t, i) => ({ t, i })).sort((a, b) => (high ? b.t.atk - a.t.atk : a.t.atk - b.t.atk) || a.i - b.i).map((x) => x.t);
}

export function selectEnemies<T extends Slotted>(team: readonly T[], to: EnemyTarget, count: number, rng: Rng): T[] {
  if (team.length === 0) return [];
  switch (to) {
    case "front":
      return [team[0]!];
    case "back":
      return [team[team.length - 1]!];
    case "all":
      return [...team];
    case "random":
      return rng.shuffle(team).slice(0, count);
    case "strongest":
      return strongest(team, true).slice(0, 1);
    case "weakest":
      return strongest(team, false).slice(0, 1);
  }
}
