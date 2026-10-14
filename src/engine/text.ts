/** Human-readable descriptions of abilities, generated from the data so text and rules cannot drift apart. */

import { FACTION_DEFS, species } from "./data.js";
import type { Ability, AllyTarget, Effect, EnemyTarget, FactionId, Trigger } from "./types.js";

export const TRIGGER_TEXT: Record<Trigger, string> = {
  battleStart: "Battle start",
  faint: "Faint",
  hurt: "Hurt",
  kill: "Kill",
  allyFaint: "Ally faints",
  sell: "Sell",
  turnStart: "Start of turn",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function allies(to: AllyTarget, count: number | undefined, faction: FactionId | undefined): string {
  switch (to) {
    case "self": return "itself";
    case "ahead": return "the ally ahead";
    case "behind": return "the ally behind";
    case "adjacent": return "adjacent allies";
    case "random": return count && count > 1 ? `${count} random allies` : "a random ally";
    case "all": return "all allies";
    case "others": return "all other allies";
    case "faction": {
      const name = faction ? FACTION_DEFS[faction].name : "its faction";
      return count ? `the first ${count} ${name}` : `all ${name}`;
    }
    case "strongest": return "the strongest ally";
    case "weakest": return "the weakest ally";
  }
}

function enemies(to: EnemyTarget, count: number | undefined): string {
  switch (to) {
    case "front": return "the front enemy";
    case "back": return "the last enemy";
    case "random": return count && count > 1 ? `${count} random enemies` : "a random enemy";
    case "all": return "all enemies";
    case "strongest": return "the strongest enemy";
    case "weakest": return "the weakest enemy";
  }
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** `owner` is the faction of whoever has the ability: "all of its faction" reads as that faction's name. */
export function describeEffect(effect: Effect, level: number, owner?: FactionId): string {
  switch (effect.kind) {
    case "buff": {
      const atk = (effect.atk ?? 0) * level;
      const hp = (effect.hp ?? 0) * level;
      const stats = atk && hp ? `${sign(atk)}/${sign(hp)}` : atk ? `${sign(atk)} attack` : `${sign(hp)} health`;
      return `give ${allies(effect.to, effect.count, effect.faction ?? owner)} ${stats}`;
    }
    case "hit":
      return `deal ${effect.dmg * level} damage to ${enemies(effect.to, effect.count)}`;
    case "summon": {
      const n = effect.count ?? 1;
      const name = species(effect.id).name;
      return `summon ${n > 1 ? `${n} × ` : "a "}${name} (${effect.atk * level}/${effect.hp * level})`;
    }
    case "status":
      return `give ${allies(effect.to, effect.count, effect.faction ?? owner)} ${effect.status === "barrier" ? "a barrier" : "venom"}`;
    case "gold":
      return `gain ${effect.amount * level} ${plural(effect.amount * level, "gold", "gold")}`;
    case "revive":
      return `return once with ${Math.round(effect.pct * 100)}% of its stats`;
  }
}

export function describeAbility(ability: Ability, level = 1, owner?: FactionId): string {
  const body = ability.effects.map((e) => describeEffect(e, level, owner)).join(", then ");
  return `${TRIGGER_TEXT[ability.trigger]}: ${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

export const STATUS_TEXT: Record<"barrier" | "venom", string> = {
  barrier: "Barrier: ignores the next hit it would take.",
  venom: "Venom: any damage its attacks deal is lethal.",
};
