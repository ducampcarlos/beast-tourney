import Phaser from "phaser";

import { pointsEarned } from "../engine/achievements.js";
import { BRANCHES, BRANCH_INFO, SKILLS, type SkillDef, skill } from "../engine/skills.js";
import type { Audio } from "./audio.js";
import type { Session } from "./session.js";
import { flushTrophies } from "./toasts.js";
import { COLOR, W, backdrop, button, fadeIn, go, panel, text, toast } from "./ui.js";

const COL_W = 300;
const CARD_H = 82;
const TOP = 150;

/** The skill tree: three branches of four skills, bought with the points that challenges give. */
export class Skills extends Phaser.Scene {
  private page: Phaser.GameObjects.GameObject[] = [];
  private session!: Session;

  constructor() {
    super("Skills");
  }

  create(): void {
    this.session = this.registry.get("session") as Session;
    this.page = [];
    (this.registry.get("audio") as Audio).music("menu");
    fadeIn(this);
    backdrop(this, 1.2);
    panel(this, 0, 0, W, 54, "ui_ancient_brown");
    text(this, 18, 26, "Skill Tree", 30, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    button(this, 700, 27, "Respec", () => this.respec(), { w: 130, h: 40, color: "yellow", size: 20 });
    button(this, 880, 27, "Back", () => go(this, "Menu"), { w: 130, h: 40, color: "grey", size: 20 });
    panel(this, 12, 64, W - 24, 464, "ui_ancient_brown");
    this.draw();
    flushTrophies(this);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.page.push(o);
    return o;
  }

  private respec(): void {
    if (this.session.profile.skills.length === 0) return toast(this, "Nothing to take back yet.", COLOR.muted);
    this.session.forgetSkills();
    (this.registry.get("audio") as Audio).sfx("select", 0.5);
    this.draw();
  }

  private draw(): void {
    for (const o of this.page) o.destroy();
    this.page = [];
    const owned = this.session.profile.skills;
    const earned = pointsEarned(this.session.profile.trophies);
    const left = this.session.points();
    this.keep(text(this, 190, 22, `${left} point${left === 1 ? "" : "s"} to spend`, 22, left > 0 ? COLOR.gold : COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5));
    this.keep(text(this, 190, 42, `${earned} earned from challenges`, 12, COLOR.muted).setOrigin(0, 0.5));

    BRANCHES.forEach((branch, col) => {
      const x = 22 + col * (COL_W + 12);
      const info = BRANCH_INFO[branch];
      this.keep(text(this, x + COL_W / 2, 84, info.name, 26, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0.5));
      this.keep(text(this, x + COL_W / 2, 112, info.blurb, 15, COLOR.muted).setOrigin(0.5));
      SKILLS.filter((s) => s.branch === branch).forEach((s, row) => this.card(s, x, TOP + row * (CARD_H + 6), owned, left));
    });
  }

  private card(s: SkillDef, x: number, y: number, owned: readonly string[], left: number): void {
    const has = owned.includes(s.id);
    const open = s.requires.every((r) => owned.includes(r));
    const affordable = left >= s.cost;
    const buyable = !has && open && affordable;
    const fill = has ? 0x4a3a22 : open ? 0x3b2a1a : 0x2a2018;
    const stroke = has ? 0xf2c14e : buyable ? 0x6fd08c : open ? 0x7a5a38 : 0x4a3a2a;
    const box = this.keep(this.add.rectangle(x + COL_W / 2, y + CARD_H / 2, COL_W, CARD_H, fill, 0.9).setStrokeStyle(3, stroke));
    const icon = this.keep(this.add.image(x + 34, y + CARD_H / 2, "dungeon", s.icon).setScale(3));
    if (!has && !open) icon.setTintFill(0x1a1410).setAlpha(0.8);
    else if (!has) icon.setAlpha(buyable ? 1 : 0.6);
    this.keep(text(this, x + 66, y + 8, s.name, 19, has ? COLOR.gold : open ? COLOR.cream : COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 3 }));
    this.keep(text(this, x + 66, y + 32, open || has ? s.text : `Needs ${s.requires.map((r) => skill(r).name).join(" and ")}.`, 13, open || has ? COLOR.cream : COLOR.muted, { wordWrap: { width: COL_W - 80 }, lineSpacing: 1 }));
    const tag = has ? "Owned" : `${s.cost} pts`;
    this.keep(text(this, x + COL_W - 10, y + 8, tag, 15, has ? COLOR.green : affordable ? COLOR.gold : COLOR.red, { stroke: "#2a1f1a", strokeThickness: 3 }).setOrigin(1, 0));
    box.setInteractive({ useHandCursor: !has });
    box.on("pointerover", () => !has && box.setFillStyle(buyable ? 0x4b3b24 : fill, 0.95));
    box.on("pointerout", () => box.setFillStyle(fill, 0.9));
    box.on("pointerup", () => this.buy(s));
  }

  private buy(s: SkillDef): void {
    const audio = this.registry.get("audio") as Audio;
    const r = this.session.learn(s.id);
    if (!r.ok) {
      audio.sfx("error", 0.45);
      return toast(this, r.error);
    }
    audio.sfx("levelup", 0.6, 1.2);
    this.draw();
  }
}
