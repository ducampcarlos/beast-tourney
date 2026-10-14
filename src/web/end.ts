import Phaser from "phaser";

import { species } from "../engine/data.js";
import { MAX_ROUNDS } from "../engine/enemy.js";
import { type Run, continueEndless } from "../engine/run.js";
import type { Audio } from "./audio.js";
import { CreatureView } from "./creature.js";
import { burst } from "./fx.js";
import type { Session } from "./session.js";
import { flushTrophies } from "./toasts.js";
import { COLOR, H, W, backdrop, button, fadeIn, go, panel, text, type Button } from "./ui.js";

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
    const title = text(this, W / 2, 100, won ? "CHAMPION!" : "ELIMINATED", 70, won ? COLOR.gold : COLOR.red, { stroke: "#2a1f1a", strokeThickness: 12 }).setOrigin(0.5);
    this.tweens.add({ targets: title, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const headline = run.endless ? (won ? "" : `You fell in the Endless Depths, round ${run.round}.`) : won ? "You won the Beast Tourney." : `You fell in round ${run.round} of ${MAX_ROUNDS}.`;
    text(this, W / 2, 158, headline, 26, COLOR.cream).setOrigin(0.5);

    // the team that carried you
    const team = run.team.filter((u): u is NonNullable<typeof u> => u !== null);
    team.forEach((u, i) => {
      const x = W / 2 + (i - (team.length - 1) / 2) * 104;
      const v = new CreatureView(this, x, 250, { sp: u.sp, level: u.level, exp: u.exp, atk: u.atk, hp: u.hp, relic: u.relic });
      v.setDepth(5);
    });
    if (team.length === 0) text(this, W / 2, 250, "(no creatures left)", 20, COLOR.muted).setOrigin(0.5);

    const wins = run.history.filter((h) => h.outcome === "win").length;
    const lines = [
      `${run.difficulty[0]!.toUpperCase()}${run.difficulty.slice(1)}   ·   Seed ${run.seed}`,
      `Rounds won: ${wins}   ·   Lives left: ${run.lives}${run.endless ? `   ·   Deepest: ${Math.max(session.profile.depth[run.difficulty], run.round)}` : ""}`,
      team.length > 0 ? `Strongest: ${strongest(team)}` : "",
    ].filter(Boolean);
    text(this, W / 2, 350, lines.join("\n"), 22, COLOR.cream, { align: "center", lineSpacing: 8 }).setOrigin(0.5, 0);

    button(this, W / 2 - 230, 450, "New Run", () => {
      session.start(run.difficulty);
      go(this, "Shop");
    }, { w: 190, h: 50, color: "green", size: 26 });
    if (won && !run.endless) {
      // The tournament is won; the Depths are for those who want more.
      button(this, W / 2, 450, "Endless", () => {
        const next = continueEndless(run);
        if (!next.ok) return;
        session.update(next.run);
        go(this, "Shop");
      }, { w: 190, h: 50, color: "yellow", size: 26 });
    } else {
      const share = button(this, W / 2, 450, "Copy result", () => {
        const where = run.endless ? `reached round ${run.round} in the Endless Depths` : won ? "champion" : `out in round ${run.round}`;
        const summary = `Beast Tourney - ${run.difficulty}, seed ${run.seed}: ${where} (${wins} rounds won)`;
        void navigator.clipboard?.writeText(summary).then(() => share.setLabel("Copied!"), () => share.setLabel("Copy failed"));
      }, { w: 190, h: 50, color: "blue", size: 22 }) as Button;
    }
    button(this, W / 2 + 230, 450, "Menu", () => go(this, "Menu"), { w: 190, h: 50, color: "grey", size: 24 });

    if (won) for (let i = 0; i < 8; i++) this.time.delayedCall(i * 220, () => burst(this, 120 + Math.random() * 720, 120 + Math.random() * 220, "fx_star_01", 18, [0xffe27a, 0xff9d6b, 0x9dd8ff][i % 3]!, 260, 50));
    (window as unknown as { __tourney?: Record<string, unknown> }).__tourney && ((window as unknown as { __tourney: Record<string, unknown> }).__tourney.end = { run });
    void H;
  }
}

function strongest(team: Array<{ sp: string; atk: number; hp: number; level: number }>): string {
  const best = [...team].sort((a, b) => b.atk + b.hp - (a.atk + a.hp))[0]!;
  return `${species(best.sp).name} (${best.atk}/${best.hp}, level ${best.level})`;
}
