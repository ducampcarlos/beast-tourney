import Phaser from "phaser";

import { oath, species } from "../engine/data.js";
import { MAX_ROUNDS } from "../engine/enemy.js";
import { type Run, continueEndless } from "../engine/run.js";
import { shareText } from "../engine/share.js";
import type { Audio } from "./audio.js";
import { CreatureView } from "./creature.js";
import { burst } from "./fx.js";
import type { Session } from "./session.js";
import { flushTrophies } from "./toasts.js";
import { COLOR, H, W, backdrop, button, fadeIn, go, panel, text, type Button } from "./ui.js";
import { rankName, t } from "../i18n/index.js";

export class End extends Phaser.Scene {
  private run!: Run;

  constructor() {
    super("End");
  }

  init(data: { run: Run }): void {
    this.run = data.run;
  }

  create(): void {
    const audio = this.registry.get("audio") as Audio;
    const session = this.registry.get("session") as Session;
    const run = this.run;
    const won = run.phase === "won";
    audio.music(won ? "victory" : "defeat", false);
    fadeIn(this);
    backdrop(this, 1.5);
    flushTrophies(this);

    panel(this, W / 2 - 330, 40, 660, 456, "ui_ancient_brown");
    const title = text(this, W / 2, 100, won ? t("CHAMPION!") : t("ELIMINATED"), 70, won ? COLOR.gold : COLOR.red, { stroke: "#2a1f1a", strokeThickness: 12 }).setOrigin(0.5);
    this.tweens.add({ targets: title, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const headline = run.endless ? (won ? "" : t("You fell in the Endless Depths, round {round}.", { round: run.round })) : won ? t("You won the Beast Tourney.") : t("You fell in round {round} of {max}.", { round: run.round, max: MAX_ROUNDS });
    text(this, W / 2, 158, headline, 26, COLOR.cream).setOrigin(0.5);

    // the team that carried you
    const team = run.team.filter((u): u is NonNullable<typeof u> => u !== null);
    team.forEach((u, i) => {
      const x = W / 2 + (i - (team.length - 1) / 2) * 104;
      const v = new CreatureView(this, x, 250, { sp: u.sp, level: u.level, exp: u.exp, atk: u.atk, hp: u.hp, relic: u.relic });
      v.setDepth(5);
    });
    if (team.length === 0) text(this, W / 2, 250, t("(no creatures left)"), 20, COLOR.muted).setOrigin(0.5);

    const wins = run.history.filter((h) => h.outcome === "win").length;
    const lines = [
      t("{rank}   ·   Seed {seed}", { rank: rankName(run.difficulty), seed: run.seed }),
      t("Rounds won: {wins}   ·   Lives left: {lives}", { wins, lives: run.lives }) + (run.endless ? t("   ·   Deepest: {depth}", { depth: Math.max(session.profile.depth[run.difficulty], run.round) }) : ""),
      run.oaths.length > 0 ? t("Oaths: {names}", { names: run.oaths.map((id) => t(oath(id).name)).join(", ") }) : "",
      team.length > 0 ? t("Strongest: {name}", { name: strongest(team) }) : "",
    ].filter(Boolean);
    text(this, W / 2, lines.length > 3 ? 330 : 350, lines.join("\n"), lines.length > 3 ? 19 : 22, COLOR.cream, { align: "center", lineSpacing: lines.length > 3 ? 4 : 8 }).setOrigin(0.5, 0);

    const offerEndless = won && !run.endless;
    // The tournament is won; the Depths are for those who want more, so the row has four buttons.
    const xs = offerEndless ? [-237, -79, 79, 237] : [-230, 0, 230];
    const w = offerEndless ? 144 : 190;
    const size = offerEndless ? 22 : 26;
    button(this, W / 2 + xs[0]!, 450, t("New Run"), () => {
      session.start(run.difficulty);
      go(this, "Shop");
    }, { w, h: 50, color: "green", size });
    let i = 1;
    if (offerEndless) {
      button(this, W / 2 + xs[i++]!, 450, t("Endless"), () => {
        const next = continueEndless(run);
        if (!next.ok) return;
        session.update(next.run);
        go(this, "Shop");
      }, { w, h: 50, color: "yellow", size });
    }
    const share = button(this, W / 2 + xs[i++]!, 450, t("Copy result"), () => {
      void navigator.clipboard?.writeText(shareText(run)).then(() => share.setLabel(t("Copied!")), () => share.setLabel(t("Copy failed")));
    }, { w, h: 50, color: "blue", size: offerEndless ? 20 : 22 }) as Button;
    button(this, W / 2 + xs[i]!, 450, t("Menu"), () => go(this, "Menu"), { w, h: 50, color: "grey", size });

    if (won) for (let i = 0; i < 8; i++) this.time.delayedCall(i * 220, () => burst(this, 120 + Math.random() * 720, 120 + Math.random() * 220, "fx_star_01", 18, [0xffe27a, 0xff9d6b, 0x9dd8ff][i % 3]!, 260, 50));
    (window as unknown as { __tourney?: Record<string, unknown> }).__tourney && ((window as unknown as { __tourney: Record<string, unknown> }).__tourney.end = { run });
    void H;
  }
}

function strongest(team: Array<{ sp: string; atk: number; hp: number; level: number }>): string {
  const best = [...team].sort((a, b) => b.atk + b.hp - (a.atk + a.hp))[0]!;
  return t("{name} ({atk}/{hp}, level {level})", { name: t(species(best.sp).name), atk: best.atk, hp: best.hp, level: best.level });
}
