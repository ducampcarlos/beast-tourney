import Phaser from "phaser";

import { FACTION_DEFS, SPECIES_LIST, species } from "../engine/data.js";
import { describeAbility } from "../engine/text.js";
import { FACTIONS } from "../engine/types.js";
import type { Audio } from "./audio.js";
import type { Session } from "./session.js";
import { COLOR, H, W, backdrop, button, fadeIn, go, lighten, panel, text } from "./ui.js";
import { flushTrophies } from "./toasts.js";

const CELL = 62;
const GRID_X = 168;
const GRID_Y = 96;

export class Bestiary extends Phaser.Scene {
  private detail: Phaser.GameObjects.GameObject[] = [];
  private session!: Session;

  constructor() {
    super("Bestiary");
  }

  create(): void {
    this.session = this.registry.get("session") as Session;
    this.detail = [];
    (this.registry.get("audio") as Audio).music("menu");
    fadeIn(this);
    backdrop(this, 1.2);
    panel(this, 0, 0, W, 54, "ui_ancient_brown");
    text(this, 18, 26, "Bestiary", 30, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    const seen = SPECIES_LIST.filter((s) => this.session.profile.seen.includes(s.id)).length;
    text(this, 190, 27, `${seen} of ${SPECIES_LIST.length} met`, 22, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5);
    button(this, 880, 27, "Back", () => go(this, "Menu"), { w: 130, h: 40, color: "grey", size: 20 });

    panel(this, 12, 64, 630, 464, "ui_ancient_brown");
    FACTIONS.forEach((f, row) => {
      const def = FACTION_DEFS[f];
      const y = GRID_Y + row * 60;
      const label = text(this, 28, y, def.name, 20, lighten(def.color, 0.5), { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      label.on("pointerover", () => this.showFaction(f));
      label.on("pointerup", () => this.showFaction(f));
      SPECIES_LIST.filter((s) => s.faction === f).forEach((s, col) => {
        const x = GRID_X + col * CELL;
        const known = this.session.profile.seen.includes(s.id);
        this.add.rectangle(x, y, CELL - 6, CELL - 6, 0x3b2a1a, 0.8).setStrokeStyle(3, known ? def.color : 0x4a3a2a);
        const sprite = this.add.sprite(x, y, "creatures", s.frames[0]).setScale(3);
        if (!known) sprite.setTintFill(0x1a1410).setAlpha(0.9);
        const hit = this.add.rectangle(x, y, CELL - 6, CELL - 6, 0xffffff, 0).setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => this.show(s.id, known));
        hit.on("pointerup", () => this.show(s.id, known));
      });
    });

    panel(this, 650, 64, 298, 464, "ui_ancient_brown");
    this.show(SPECIES_LIST[0]!.id, this.session.profile.seen.includes(SPECIES_LIST[0]!.id));
    flushTrophies(this);
  }

  /** Hovering a faction name shows what it is about and what its bonds do. */
  private showFaction(f: (typeof FACTIONS)[number]): void {
    for (const o of this.detail) o.destroy();
    this.detail = [];
    const def = FACTION_DEFS[f];
    const x = 666;
    let y = 80;
    const add = (o: Phaser.GameObjects.GameObject) => this.detail.push(o);
    add(text(this, x, y, def.name, 30, lighten(def.color, 0.5), { stroke: "#2a1f1a", strokeThickness: 5 }));
    y += 44;
    const blurb = text(this, x, y, def.blurb, 18, COLOR.cream, { wordWrap: { width: 266 } });
    add(blurb);
    y += blurb.height + 18;
    for (const b of def.bonds) {
      add(text(this, x, y, `${b.need} different creatures`, 18, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 3 }));
      y += 26;
      const t = text(this, x, y, b.text, 17, COLOR.cream, { wordWrap: { width: 266 } });
      add(t);
      y += t.height + 16;
    }
    const members = SPECIES_LIST.filter((s) => s.faction === f);
    members.forEach((m, i) => {
      const known = this.session.profile.seen.includes(m.id);
      const sp = this.add.sprite(x + 20 + (i % 6) * 44, y + 24 + Math.floor(i / 6) * 44, "creatures", m.frames[0]).setScale(2.4);
      if (!known) sp.setTintFill(0x1a1410).setAlpha(0.9);
      add(sp);
    });
  }

  private show(id: string, known: boolean): void {
    for (const o of this.detail) o.destroy();
    this.detail = [];
    const sp = species(id);
    const def = FACTION_DEFS[sp.faction];
    const x = 666;
    let y = 80;
    const add = (o: Phaser.GameObjects.GameObject) => this.detail.push(o);
    if (!known) {
      add(text(this, x, y, "???", 28, COLOR.muted));
      add(text(this, x, y + 40, "You have not met this creature yet. Play on to find it in the shop or across the arena.", 18, COLOR.muted, { wordWrap: { width: 262 } }));
      return;
    }
    add(text(this, x, y, sp.name, 26, COLOR.gold, { wordWrap: { width: 270 } }));
    y += 34;
    add(text(this, x, y, `${def.name}  ·  Tier ${sp.tier}`, 18, "#" + def.color.toString(16).padStart(6, "0")));
    y += 28;
    // the three forms
    sp.frames.forEach((frame, i) => {
      add(this.add.rectangle(x + 40 + i * 92, y + 40, 80, 80, 0x3b2a1a, 0.8).setStrokeStyle(3, 0x7a5a38));
      add(this.add.sprite(x + 40 + i * 92, y + 40, "creatures", frame).setScale(4));
      add(text(this, x + 40 + i * 92, y + 92, `Lv ${i + 1}`, 14, COLOR.muted).setOrigin(0.5));
    });
    y += 108;
    add(text(this, x, y, `Attack ${sp.atk}   Health ${sp.hp}`, 20, COLOR.cream));
    y += 30;
    if (sp.ability) {
      const t = text(this, x, y, [1, 2, 3].map((l) => `Lv${l}: ${describeAbility(sp.ability!, l, sp.faction)}`).join("\n"), 15, COLOR.cream, { wordWrap: { width: 266 }, lineSpacing: 3 });
      add(t);
      y += t.height + 10;
    }
    if (sp.flavor) add(text(this, x, y, sp.flavor, 15, COLOR.muted, { wordWrap: { width: 266 } }));
    void H;
  }
}
