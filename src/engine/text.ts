/**
 * Human-readable descriptions of abilities, generated from the data so text and rules cannot drift
 * apart. They are built from phrases rather than translated sentence by sentence, because the
 * word order and the small words (articles, prepositions) differ between languages.
 */

import { getLang, t, type Lang } from "../i18n/index.js";
import { FACTION_DEFS, species } from "./data.js";
import type { Ability, AllyTarget, Effect, EnemyTarget, FactionId, Trigger } from "./types.js";

/** The words a language needs. `ally` and `enemy` come with their own preposition where the language wants one. */
interface Pack {
  trigger: Record<Trigger, string>;
  then: string;
  /** The stats of a buff: "+1/+1", "+2 attack", "+3 health". */
  attack: (n: string) => string;
  health: (n: string) => string;
  /** A target phrase, ready to follow the verb. */
  ally: (to: AllyTarget, count: number | undefined, faction: string | undefined) => string;
  enemy: (to: EnemyTarget, count: number | undefined) => string;
  /** The whole clauses; `self` is true when the effect lands on the owner. */
  buff: (stats: string, who: string, self: boolean) => string;
  status: (status: "barrier" | "venom", who: string, self: boolean) => string;
  hit: (dmg: number, who: string) => string;
  summon: (n: number, name: string, atk: number, hp: number) => string;
  gold: (n: number) => string;
  revive: (pct: number) => string;
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const EN: Pack = {
  trigger: { battleStart: "Battle start", faint: "Faint", hurt: "Hurt", kill: "Kill", allyFaint: "Ally faints", sell: "Sell", turnStart: "Start of turn" },
  then: ", then ",
  attack: (n) => `${n} attack`,
  health: (n) => `${n} health`,
  ally: (to, count, faction) => {
    switch (to) {
      case "self": return "itself";
      case "ahead": return "the ally ahead";
      case "behind": return "the ally behind";
      case "adjacent": return "adjacent allies";
      case "random": return count && count > 1 ? `${count} random allies` : "a random ally";
      case "all": return "all allies";
      case "others": return "all other allies";
      case "faction": return count ? `the first ${count} ${faction ?? "of its faction"}` : `all ${faction ?? "of its faction"}`;
      case "strongest": return "the strongest ally";
      case "weakest": return "the weakest ally";
    }
  },
  enemy: (to, count) => {
    switch (to) {
      case "front": return "the front enemy";
      case "back": return "the last enemy";
      case "random": return count && count > 1 ? `${count} random enemies` : "a random enemy";
      case "all": return "all enemies";
      case "strongest": return "the strongest enemy";
      case "weakest": return "the weakest enemy";
    }
  },
  buff: (stats, who) => `give ${who} ${stats}`,
  status: (status, who) => `give ${who} ${status === "barrier" ? "a barrier" : "venom"}`,
  hit: (dmg, who) => `deal ${dmg} damage to ${who}`,
  summon: (n, name, atk, hp) => `summon ${n > 1 ? `${n} × ` : "a "}${name} (${atk}/${hp})`,
  gold: (n) => `gain ${n} gold`,
  revive: (pct) => `return once with ${pct}% of its stats`,
};

const ES: Pack = {
  trigger: { battleStart: "Inicio del combate", faint: "Al caer", hurt: "Al recibir daño", kill: "Al derrotar", allyFaint: "Cuando cae un aliado", sell: "Al vender", turnStart: "Inicio del turno" },
  then: ", luego ",
  attack: (n) => `${n} de ataque`,
  health: (n) => `${n} de vida`,
  ally: (to, count, faction) => {
    switch (to) {
      case "self": return "sí mismo";
      case "ahead": return "el aliado de delante";
      case "behind": return "el aliado de detrás";
      case "adjacent": return "los aliados adyacentes";
      case "random": return count && count > 1 ? `${count} aliados al azar` : "un aliado al azar";
      case "all": return "todos los aliados";
      case "others": return "todos los demás aliados";
      case "faction": return count ? `los primeros ${count} aliados de la facción ${faction ?? ""}`.trim() : `todos los aliados de la facción ${faction ?? ""}`.trim();
      case "strongest": return "el aliado más fuerte";
      case "weakest": return "el aliado más débil";
    }
  },
  enemy: (to, count) => {
    switch (to) {
      case "front": return "al enemigo del frente";
      case "back": return "al último enemigo";
      case "random": return count && count > 1 ? `a ${count} enemigos al azar` : "a un enemigo al azar";
      case "all": return "a todos los enemigos";
      case "strongest": return "al enemigo más fuerte";
      case "weakest": return "al enemigo más débil";
    }
  },
  buff: (stats, who, self) => (self ? `ganar ${stats}` : `dar ${stats} a ${who}`),
  status: (status, who, self) => (self ? `ganar ${status === "barrier" ? "una barrera" : "veneno"}` : `dar ${status === "barrier" ? "una barrera" : "veneno"} a ${who}`),
  hit: (dmg, who) => `infligir ${dmg} de daño ${who}`,
  summon: (n, name, atk, hp) => `invocar ${n > 1 ? `${n} × ` : ""}${name} (${atk}/${hp})`,
  gold: (n) => `ganar ${n} de oro`,
  revive: (pct) => `volver una vez con el ${pct}% de sus estadísticas`,
};

const PT: Pack = {
  trigger: { battleStart: "Início da batalha", faint: "Ao cair", hurt: "Ao sofrer dano", kill: "Ao derrotar", allyFaint: "Quando um aliado cai", sell: "Ao vender", turnStart: "Início do turno" },
  then: ", depois ",
  attack: (n) => `${n} de ataque`,
  health: (n) => `${n} de vida`,
  ally: (to, count, faction) => {
    switch (to) {
      case "self": return "si mesmo";
      case "ahead": return "o aliado da frente";
      case "behind": return "o aliado de trás";
      case "adjacent": return "os aliados adjacentes";
      case "random": return count && count > 1 ? `${count} aliados aleatórios` : "um aliado aleatório";
      case "all": return "todos os aliados";
      case "others": return "todos os outros aliados";
      case "faction": return count ? `os primeiros ${count} aliados da facção ${faction ?? ""}`.trim() : `todos os aliados da facção ${faction ?? ""}`.trim();
      case "strongest": return "o aliado mais forte";
      case "weakest": return "o aliado mais fraco";
    }
  },
  enemy: (to, count) => {
    switch (to) {
      case "front": return "ao inimigo da frente";
      case "back": return "ao último inimigo";
      case "random": return count && count > 1 ? `a ${count} inimigos aleatórios` : "a um inimigo aleatório";
      case "all": return "a todos os inimigos";
      case "strongest": return "ao inimigo mais forte";
      case "weakest": return "ao inimigo mais fraco";
    }
  },
  buff: (stats, who, self) => (self ? `ganhar ${stats}` : `dar ${stats} a ${who}`),
  status: (status, who, self) => (self ? `ganhar ${status === "barrier" ? "uma barreira" : "veneno"}` : `dar ${status === "barrier" ? "uma barreira" : "veneno"} a ${who}`),
  hit: (dmg, who) => `causar ${dmg} de dano ${who}`,
  summon: (n, name, atk, hp) => `invocar ${n > 1 ? `${n} × ` : ""}${name} (${atk}/${hp})`,
  gold: (n) => `ganhar ${n} de ouro`,
  revive: (pct) => `voltar uma vez com ${pct}% dos seus atributos`,
};

const PACKS: Record<Lang, Pack> = { en: EN, es: ES, pt: PT };

export const TRIGGERS: readonly Trigger[] = ["battleStart", "faint", "hurt", "kill", "allyFaint", "sell", "turnStart"];

/** The name of a trigger in the current language ("Battle start"). */
export const triggerText = (trigger: Trigger): string => PACKS[getLang()].trigger[trigger];

/** English only: kept for code and tests that want the plain names. */
export const TRIGGER_TEXT: Record<Trigger, string> = EN.trigger;

/** `owner` is the faction of whoever has the ability: "all of its faction" reads as that faction's name. */
export function describeEffect(effect: Effect, level: number, owner?: FactionId): string {
  const pack = PACKS[getLang()];
  const factionName = (f: FactionId | undefined) => (f ? t(FACTION_DEFS[f].name) : undefined);
  switch (effect.kind) {
    case "buff": {
      const atk = (effect.atk ?? 0) * level;
      const hp = (effect.hp ?? 0) * level;
      const stats = atk && hp ? `${sign(atk)}/${sign(hp)}` : atk ? pack.attack(sign(atk)) : pack.health(sign(hp));
      return pack.buff(stats, pack.ally(effect.to, effect.count, factionName(effect.faction ?? owner)), effect.to === "self");
    }
    case "hit":
      return pack.hit(effect.dmg * level, pack.enemy(effect.to, effect.count));
    case "summon":
      return pack.summon(effect.count ?? 1, t(species(effect.id).name), effect.atk * level, effect.hp * level);
    case "status":
      return pack.status(effect.status, pack.ally(effect.to, effect.count, factionName(effect.faction ?? owner)), effect.to === "self");
    case "gold":
      return pack.gold(effect.amount * level);
    case "revive":
      return pack.revive(Math.round(effect.pct * 100));
  }
}

export function describeAbility(ability: Ability, level = 1, owner?: FactionId): string {
  const pack = PACKS[getLang()];
  const body = ability.effects.map((e) => describeEffect(e, level, owner)).join(pack.then);
  return `${pack.trigger[ability.trigger]}: ${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

export const STATUS_TEXT: Record<"barrier" | "venom", string> = {
  barrier: "Barrier: ignores the next hit it would take.",
  venom: "Venom: any damage its attacks deal is lethal.",
};
/** The explanation of a status in the current language. */
export const statusText = (status: "barrier" | "venom"): string => t(STATUS_TEXT[status]);
