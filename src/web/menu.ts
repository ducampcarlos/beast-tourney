import Phaser from "phaser";

import { SPECIES_LIST } from "../engine/data.js";
import { DIFFICULTIES, type Difficulty } from "../engine/types.js";
import type { Audio } from "./audio.js";
import { CreatureView } from "./creature.js";
import type { Session } from "./session.js";
import { HELP_LINES } from "./help.js";
import { openSettings } from "./settings.js";
import { COLOR, H, W, backdrop, button, fadeIn, go, overlay, panel, text, type Button } from "./ui.js";

const BLURB: Record<Difficulty, string> = {
  squire: "Gentle opponents and five lives. A good first tournament.",
  knight: "Fair fights and four lives. The intended challenge.",
  champion: "Fierce opponents and three lives. For veterans.",
};

export class Menu extends Phaser.Scene {
  private difficulty: Difficulty = "knight";
  private pickButtons = new Map<Difficulty, Button>();
  private blurb!: Phaser.GameObjects.Text;

  constructor() {
    super("Menu");
  }

  create(): void {
    const session = this.registry.get("session") as Session;
    const audio = this.registry.get("audio") as Audio;
    fadeIn(this);
    this.pickButtons = new Map();
    audio.music("menu");
    this.difficulty = (this.registry.get("difficulty") as Difficulty | undefined) ?? "knight";
    backdrop(this);

    // title
    const title = text(this, W / 2, 70, "BEAST TOURNEY", 76, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 12 }).setOrigin(0.5);
    text(this, W / 2, 128, "A fantasy creature auto-battler", 26, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 76, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // the parade
    this.parade();

    // menu panel
    panel(this, W / 2 - 230, 156, 460, 354, "ui_ancient_brown");
    text(this, W / 2, 176, "Choose your rank", 24, COLOR.cream).setOrigin(0.5);

    DIFFICULTIES.forEach((d, i) => {
      const b = button(this, W / 2 - 150 + i * 150, 218, d[0]!.toUpperCase() + d.slice(1), () => this.pick(d), { w: 140, h: 44, size: 22, color: "yellow" }) as Button;
      this.pickButtons.set(d, b);
    });
    this.blurb = text(this, W / 2, 266, "", 20, COLOR.cream, { align: "center", wordWrap: { width: 400 } }).setOrigin(0.5);

    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get("seed");
    button(this, W / 2, 322, "New Run", () => this.begin(session, seedParam ? Number(seedParam) >>> 0 : undefined), { w: 280, h: 54, color: "green", size: 30 });

    if (session.hasSavedRun()) {
      const r = session.run!;
      button(this, W / 2, 376, `Continue (round ${r.round}, ${r.lives} lives)`, () => go(this, "Shop"), { w: 400, h: 44, color: "yellow", size: 20 });
    } else {
      button(this, W / 2, 376, "Daily Run", () => this.begin(session, dailySeed(), "knight"), { w: 280, h: 44, color: "blue", size: 22 });
    }
    button(this, W / 2 - 100, 424, "Bestiary", () => go(this, "Bestiary"), { w: 190, h: 40, color: "blue", size: 20 });
    button(this, W / 2 + 100, 424, "Trophies", () => go(this, "Trophies"), { w: 190, h: 40, color: "blue", size: 20 });
    button(this, W / 2 - 100, 470, "How to play", () => overlay(this, "How to play", HELP_LINES), { w: 190, h: 40, color: "grey", size: 20 });
    button(this, W / 2 + 100, 470, "Settings", () => openSettings(this), { w: 190, h: 40, color: "grey", size: 20 });

    // record
    const best = session.profile.best[this.difficulty];
    this.recordText = text(this, W / 2, 524, "", 16, COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);
    this.pick(this.difficulty, false);
    void best;

    this.input.keyboard?.on("keydown-ENTER", () => this.begin(session, seedParam ? Number(seedParam) >>> 0 : undefined));
  }

  private recordText!: Phaser.GameObjects.Text;

  private pick(d: Difficulty, sound = true): void {
    this.difficulty = d;
    this.registry.set("difficulty", d);
    const session = this.registry.get("session") as Session;
    for (const [key, b] of this.pickButtons) b.setAlpha(key === d ? 1 : 0.55);
    this.blurb.setText(BLURB[d]);
    const best = session.profile.best[d];
    this.recordText.setText(best.round > 0 ? `Best ${d}: round ${best.round}/12${best.wins > 0 ? `, ${best.wins} tournament${best.wins > 1 ? "s" : ""} won` : ""}` : `No ${d} record yet`);
    if (sound) (this.registry.get("audio") as Audio).sfx("select", 0.4);
  }

  private begin(session: Session, seed?: number, difficulty: Difficulty = this.difficulty): void {
    session.start(difficulty, seed);
    go(this, "Shop");
  }

  private parade(): void {
    const spawn = () => {
      const sp = Phaser.Utils.Array.GetRandom(SPECIES_LIST);
      const from = Math.random() < 0.5;
      const view = new CreatureView(this, from ? -60 : W + 60, 498, { sp: sp.id, atk: sp.atk, hp: sp.hp, badges: false, flip: !from, size: 1 });
      view.setDepth(-5);
      this.tweens.add({ targets: view, x: from ? W + 60 : -60, duration: 14000 + Math.random() * 6000, onComplete: () => view.destroy() });
      this.tweens.add({ targets: view, y: view.y - 8, duration: 220, yoyo: true, repeat: -1 });
    };
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 700, spawn);
    this.time.addEvent({ delay: 3200, loop: true, callback: spawn });
  }
}

/** One seed per UTC day, the same for everyone. */
export function dailySeed(date = new Date()): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}
void H;
