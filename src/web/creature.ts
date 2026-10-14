/** The on-screen creature: sprite, shadow, stat badges, level pips, relic and status markers. */

import Phaser from "phaser";

import { relic as relicDef, species } from "../engine/data.js";
import { LEVEL_EXP, type Status } from "../engine/types.js";
import { FONT, SPRITE_SCALE, text } from "./ui.js";

export interface CreatureOptions {
  sp: string;
  level?: number;
  exp?: number;
  atk: number;
  hp: number;
  relic?: string;
  statuses?: Status[];
  /** Face left (enemy side). Sprites are drawn facing right. */
  flip?: boolean;
  /** Overall size multiplier on top of the base scale (bosses are bigger). */
  size?: number;
  badges?: boolean;
}

export class CreatureView extends Phaser.GameObjects.Container {
  uid = 0;
  spId: string;
  level: number;
  exp: number;
  atk: number;
  hp: number;
  relicId?: string;
  statusList: Status[] = [];
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly atkText: Phaser.GameObjects.Text;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly badges: Phaser.GameObjects.GameObject[] = [];
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly relicIcon: Phaser.GameObjects.Image;
  private readonly barrier: Phaser.GameObjects.Image;
  private readonly venom: Phaser.GameObjects.Image;
  private bobTween?: Phaser.Tweens.Tween;
  private readonly unitSize: number;

  constructor(scene: Phaser.Scene, x: number, y: number, o: CreatureOptions) {
    super(scene, x, y);
    this.spId = o.sp;
    this.level = o.level ?? 1;
    this.exp = o.exp ?? 0;
    this.atk = o.atk;
    this.hp = o.hp;
    this.relicId = o.relic;
    this.unitSize = o.size ?? species(o.sp).scale ?? 1;
    const s = SPRITE_SCALE * this.unitSize;

    this.shadow = scene.add.image(0, 38 * this.unitSize, "shadow").setScale(1.2 * this.unitSize);
    this.sprite = scene.add.sprite(0, 0, "creatures", species(o.sp).frames[this.level - 1]).setScale(s);
    if (o.flip) this.sprite.setFlipX(true);
    this.barrier = scene.add.image(0, -2, "fx_circle_05").setTint(0x6fd0ff).setAlpha(0.55).setScale(1.55 * this.unitSize).setVisible(false);
    this.venom = scene.add.image(-30 * this.unitSize, -34 * this.unitSize, "dungeon", 114).setScale(2).setVisible(false);
    this.pips = scene.add.graphics();
    this.relicIcon = scene.add.image(30 * this.unitSize, -30 * this.unitSize, "dungeon", 103).setScale(2.4).setVisible(false);

    const by = 44 * this.unitSize;
    const bx = 21; // not scaled with size: neighbours in battle stand close
    const atkBg = scene.add.rectangle(-bx, by, 30, 26, 0xe08a2c).setStrokeStyle(3, 0x2a1f1a);
    const hpBg = scene.add.rectangle(bx, by, 30, 26, 0xc43c4c).setStrokeStyle(3, 0x2a1f1a);
    this.atkText = text(scene, -bx, by - 1, String(o.atk), 22, "#ffffff", { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);
    this.hpText = text(scene, bx, by - 1, String(o.hp), 22, "#ffffff", { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);
    this.badges.push(atkBg, hpBg, this.atkText, this.hpText);
    this.add([this.shadow, this.barrier, this.sprite, this.pips, this.relicIcon, this.venom, ...this.badges]);
    this.setSize(84 * this.unitSize, 104 * this.unitSize);

    if (o.badges === false) this.badges.forEach((b) => (b as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible?.(false));
    this.setRelic(o.relic);
    this.setStatuses(o.statuses ?? []);
    this.drawPips();
    scene.add.existing(this);
    this.startBob();
  }

  // ---- state ----------------------------------------------------------------------------

  setStats(atk: number, hp: number): void {
    this.atk = atk;
    this.hp = hp;
    this.atkText.setText(String(atk));
    this.hpText.setText(String(Math.max(0, hp)));
  }

  setLevel(level: number, exp: number): void {
    const changed = level !== this.level;
    this.level = level;
    this.exp = exp;
    this.sprite.setFrame(species(this.spId).frames[level - 1]!);
    this.drawPips();
    if (changed) this.sprite.setScale(SPRITE_SCALE * this.unitSize * (1 + (level - 1) * 0.08));
  }

  setRelic(id?: string): void {
    this.relicId = id;
    this.relicIcon.setVisible(Boolean(id));
    if (id) this.relicIcon.setFrame(relicDef(id).icon);
  }

  setStatuses(statuses: readonly Status[]): void {
    this.statusList = [...statuses];
    this.barrier.setVisible(statuses.includes("barrier"));
    this.venom.setVisible(statuses.includes("venom"));
  }

  private drawPips(): void {
    const g = this.pips;
    g.clear();
    const y = -46 * this.unitSize;
    if (this.level >= 3) {
      for (let i = 0; i < 3; i++) this.star(g, (i - 1) * 21, y);
      return;
    }
    // Level-ups show as stars; what remains to the next level shows as pips.
    if (this.level >= 2) for (let i = 0; i < this.level; i++) this.star(g, (i - (this.level - 1) / 2) * 21, y);
    const need = LEVEL_EXP[this.level + 1]! - LEVEL_EXP[this.level]!;
    const have = this.exp - LEVEL_EXP[this.level]!;
    const py = this.level >= 2 ? y + 17 : y + 6;
    for (let i = 0; i < need; i++) {
      const px = -need * 6 + i * 12 + 3;
      g.fillStyle(0x2a1f1a, 1).fillRect(px - 2, py - 2, 10, 10);
      g.fillStyle(i < have ? 0xffd34d : 0x6b5a48, 1).fillRect(px, py, 6, 6);
    }
  }

  /** A little 9x9 pixel star with a dark outline, drawn at 2px per pixel. */
  private star(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const mask = ["....X....", "....X....", "...XXX...", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", ".XXX.XXX.", ".XX...XX.", ".X.....X."];
    const px = 2;
    const x0 = cx - (9 * px) / 2;
    const y0 = cy - (9 * px) / 2;
    const draw = (dx: number, dy: number, color: number) => {
      g.fillStyle(color, 1);
      mask.forEach((row, r) => [...row].forEach((c, col) => c === "X" && g.fillRect(x0 + col * px + dx, y0 + r * px + dy, px, px)));
    };
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) draw(dx, dy, 0x2a1f1a);
    draw(0, 0, 0xffd34d);
    g.fillStyle(0xfff0a8, 1).fillRect(x0 + 8, y0 + 6, 2, 4);
  }

  // ---- motion ---------------------------------------------------------------------------

  startBob(): void {
    if (!this.scene) return;
    this.bobTween?.stop();
    this.sprite.y = 0;
    this.bobTween = this.scene.tweens.add({ targets: this.sprite, y: -3, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: Math.random() * 600 });
  }

  stopBob(): void {
    this.bobTween?.stop();
    this.sprite.y = 0;
  }

  flash(duration = 90): void {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(duration, () => this.sprite.active && this.sprite.clearTint());
  }

  pulse(scale = 1.18, duration = 140): void {
    this.scene.tweens.add({ targets: this, scale, duration, yoyo: true, ease: "Quad.easeOut" });
  }

  /** Tint the sprite briefly in a colour (healing, poison, power). */
  tintFlash(color: number, duration = 220): void {
    this.sprite.setTint(color);
    this.scene.time.delayedCall(duration, () => this.sprite.active && this.sprite.clearTint());
  }

  get badgeFont(): string {
    return FONT;
  }
}
