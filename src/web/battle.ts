import Phaser from "phaser";

import type { BattleEvent, BattleStep, UnitView } from "../engine/battle.js";
import { FACTION_DEFS, relic as relicDef, species } from "../engine/data.js";
import { BOSS_ROUNDS, bossName } from "../engine/enemy.js";
import type { FightResult, Run } from "../engine/run.js";
import { TRIGGER_TEXT } from "../engine/text.js";
import type { Audio } from "./audio.js";
import { CreatureView } from "./creature.js";
import { burst, ring, shake, shoot } from "./fx.js";
import type { Session } from "./session.js";
import { COLOR, H, W, backdrop, button, floater, panel, text, type Button } from "./ui.js";

type OkFight = Extract<FightResult, { ok: true }>;

const FRONT_GAP = 50;
const SPACING = 94;
const BASE_Y = 304;
const UNIT_SIZE = 1.3;
const posX = (side: 0 | 1, index: number): number => (side === 0 ? W / 2 - FRONT_GAP - index * SPACING : W / 2 + FRONT_GAP + index * SPACING);

export class Battle extends Phaser.Scene {
  private session!: Session;
  private audio!: Audio;
  private before!: Run;
  private result!: OkFight;
  private views = new Map<number, CreatureView>();
  private speed = 1;
  private skipRequested = false;
  private finished = false;
  private speedButton!: Button;
  private skipButton!: Button;
  private bondTags: Phaser.GameObjects.GameObject[] = [];
  private layoutSide: [UnitView[], UnitView[]] = [[], []];

  constructor() {
    super("Battle");
  }

  init(data: { before: Run; result: OkFight }): void {
    this.before = data.before;
    this.result = data.result;
    this.views = new Map();
    this.speed = 1;
    this.skipRequested = false;
    this.finished = false;
    this.bondTags = [];
  }

  create(): void {
    this.session = this.registry.get("session") as Session;
    this.audio = this.registry.get("audio") as Audio;
    const boss = BOSS_ROUNDS.includes(this.before.round);
    this.audio.music(boss ? "boss" : "battle");
    backdrop(this, 1.5);
    // the arena: a worn patch of floor with a line down the middle
    this.add.ellipse(W / 2, BASE_Y + 36, 920, 210, 0x000000, 0.28).setDepth(-6);
    this.add.ellipse(W / 2, BASE_Y + 36, 920, 210).setStrokeStyle(4, 0xf3e6c4, 0.18).setDepth(-6);
    for (let y = BASE_Y - 56; y < BASE_Y + 128; y += 22) this.add.rectangle(W / 2, y, 4, 12, 0xf3e6c4, 0.2).setDepth(-5);

    panel(this, 0, 0, W, 54, "ui_ancient_brown").setDepth(-2);
    text(this, 18, 26, `Round ${this.before.round}`, 28, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    const name = bossName(this.before.round);
    text(this, W / 2, 26, name ? `BOSS: ${name}` : "Battle", 26, name ? COLOR.red : COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0.5);

    this.speedButton = button(this, 770, 26, "Speed x1", () => this.cycleSpeed(), { w: 150, h: 38, size: 18, color: "blue" }) as Button;
    this.skipButton = button(this, 886, 26, "Skip", () => this.skip(), { w: 100, h: 38, size: 18, color: "grey" }) as Button;
    this.input.keyboard?.on("keydown-SPACE", () => this.cycleSpeed());
    this.input.keyboard?.on("keydown-ESC", () => this.skip());

    const first = this.result.battle.steps[0]!;
    this.layoutSide = first.teams;
    this.sync(first, true);
    this.exposeDebug();
    void this.play();
  }

  // ---- helpers --------------------------------------------------------------------------

  private cycleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1;
    this.speedButton.setLabel(`Speed x${this.speed}`);
  }

  private skip(): void {
    if (!this.finished) this.skipRequested = true;
  }

  private wait(ms: number): Promise<void> {
    if (this.skipRequested) return Promise.resolve();
    return new Promise((resolve) => this.time.delayedCall(ms / this.speed, resolve));
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    if (this.skipRequested) return Promise.resolve();
    return new Promise((resolve) => this.tweens.add({ ...config, duration: ((config.duration as number) ?? 200) / this.speed, onComplete: () => resolve() }));
  }

  private view(uid: number): CreatureView | undefined {
    return this.views.get(uid);
  }

  private spawnView(u: UnitView, anim: boolean): CreatureView {
    const sp = species(u.sp);
    const index = this.layoutSide[u.side].findIndex((x) => x.uid === u.uid);
    const v = new CreatureView(this, posX(u.side, Math.max(0, index)), BASE_Y, { sp: u.sp, level: u.level, atk: u.atk, hp: u.hp, relic: u.relic, statuses: u.statuses, flip: u.side === 1, size: Math.max(UNIT_SIZE, sp.scale ? sp.scale * UNIT_SIZE : 0) });
    v.uid = u.uid;
    v.setDepth(10 + (sp.tier === 6 ? 2 : 0));
    if (anim) {
      v.setScale(0.2);
      this.tweens.add({ targets: v, scale: 1, duration: 260 / this.speed, ease: "Back.easeOut" });
    }
    this.views.set(u.uid, v);
    return v;
  }

  /** Bring the views in line with a snapshot: create what is missing, remove what is gone, update numbers, close the line up. */
  private sync(step: BattleStep, initial = false): void {
    this.layoutSide = step.teams;
    const present = new Set<number>();
    for (const side of [0, 1] as const) {
      step.teams[side].forEach((u, i) => {
        present.add(u.uid);
        let v = this.views.get(u.uid);
        if (!v) v = this.spawnView(u, !initial);
        v.setStats(u.atk, u.hp);
        v.setLevel(u.level, v.exp);
        v.setStatuses(u.statuses);
        v.setRelic(u.relic);
        const x = posX(side, i);
        if (initial || this.skipRequested) v.x = x;
        else this.tweens.add({ targets: v, x, duration: 220 / this.speed, ease: "Quad.easeOut" });
        v.y = BASE_Y;
      });
    }
    for (const [uid, v] of this.views) {
      if (!present.has(uid)) {
        v.destroy();
        this.views.delete(uid);
      }
    }
  }

  // ---- the show -------------------------------------------------------------------------

  private async play(): Promise<void> {
    const steps = this.result.battle.steps;
    await this.intro();
    for (let i = 1; i < steps.length && !this.skipRequested; i++) {
      const step = steps[i]!;
      await this.playStep(step);
      this.sync(step);
      await this.wait(step.events.some((e) => e.t === "clash") ? 160 : 90);
    }
    if (this.skipRequested) {
      for (const v of this.views.values()) v.destroy();
      this.views.clear();
      this.sync(steps[steps.length - 1]!, true);
    }
    await this.finish();
  }

  private async intro(): Promise<void> {
    const name = bossName(this.before.round);
    const banner = text(this, W / 2, 150, name ? name : "Fight!", name ? 48 : 56, name ? COLOR.red : COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 10 }).setOrigin(0.5).setDepth(900).setScale(0.3).setAlpha(0);
    this.audio.sfx(name ? "bell" : "bong", 0.6);
    await this.tween({ targets: banner, scale: 1, alpha: 1, duration: 320, ease: "Back.easeOut" });
    await this.wait(name ? 750 : 380);
    await this.tween({ targets: banner, alpha: 0, y: 120, duration: 260 });
    banner.destroy();
  }

  private async playStep(step: BattleStep): Promise<void> {
    const clash = step.events.find((e): e is Extract<BattleEvent, { t: "clash" }> => e.t === "clash");
    const hasBond = step.events.some((e) => e.t === "bond");
    if (hasBond) await this.playBonds(step.events);
    if (clash) await this.playClash(step, clash);
    else for (const e of step.events) if (e.t !== "bond") await this.playEvent(e);
  }

  private async playBonds(events: BattleEvent[]): Promise<void> {
    const bonds = events.filter((e): e is Extract<BattleEvent, { t: "bond" }> => e.t === "bond");
    const perSide = [0, 0];
    for (const b of bonds) {
      const def = FACTION_DEFS[b.faction];
      const color = "#" + def.color.toString(16).padStart(6, "0");
      const x = b.side === 0 ? 24 : W - 24;
      const y = 78 + perSide[b.side]! * 32;
      perSide[b.side]!++;
      const tag = text(this, x, y, `${def.name} ${"I".repeat(b.need === 2 ? 1 : 2)}`, 24, color, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(b.side === 0 ? 0 : 1, 0.5).setDepth(300).setAlpha(0);
      this.bondTags.push(tag);
      this.tweens.add({ targets: tag, alpha: 1, duration: 250 / this.speed });
      this.audio.sfx("bell", 0.25, 1.4);
    }
    if (bonds.length > 0) await this.wait(520);
  }

  private async playClash(step: BattleStep, clash: Extract<BattleEvent, { t: "clash" }>): Promise<void> {
    const a = this.view(clash.a);
    const b = this.view(clash.b);
    if (a && b) {
      a.stopBob();
      b.stopBob();
      const ax = a.x;
      const bx = b.x;
      const mid = W / 2;
      await Promise.all([this.tween({ targets: a, x: mid - 26, duration: 150, ease: "Quad.easeIn" }), this.tween({ targets: b, x: mid + 26, duration: 150, ease: "Quad.easeIn" })]);
      // impact
      let heavy = false;
      for (const e of step.events) {
        if (e.t === "damage") {
          this.applyDamage(e);
          if (e.amount >= 6) heavy = true;
        } else if (e.t === "barrier") this.applyBarrier(e.uid);
        else if (e.t === "venom") this.applyVenom(e.uid);
      }
      this.audio.sfx(heavy ? "hit_heavy" : "hit", 0.6);
      shake(this, heavy ? 0.008 : 0.004, 110);
      burst(this, mid, BASE_Y - 10, "fx_spark_05", heavy ? 16 : 9, 0xffe9a0, 220);
      await this.wait(130);
      await Promise.all([this.tween({ targets: a, x: ax, duration: 170, ease: "Quad.easeOut" }), this.tween({ targets: b, x: bx, duration: 170, ease: "Quad.easeOut" })]);
      a.startBob();
      b.startBob();
    }
    for (const e of step.events) if (e.t !== "clash" && e.t !== "damage" && e.t !== "barrier" && e.t !== "venom") await this.playEvent(e);
  }

  private applyDamage(e: Extract<BattleEvent, { t: "damage" }>): void {
    const v = this.view(e.uid);
    if (!v) return;
    v.flash();
    v.setStats(v.atk, v.hp - e.amount);
    floater(this, v.x, v.y - 50, `-${e.amount}`, COLOR.red, 30, 600);
  }

  private applyBarrier(uid: number): void {
    const v = this.view(uid);
    if (!v) return;
    ring(this, v.x, v.y, 0x6fd0ff, 2.4);
    floater(this, v.x, v.y - 50, "BLOCKED", COLOR.blue, 24, 600);
    v.setStatuses([]);
    this.audio.sfx("glass", 0.5);
  }

  private applyVenom(uid: number): void {
    const v = this.view(uid);
    if (!v) return;
    floater(this, v.x, v.y - 60, "VENOM!", COLOR.green, 26, 600);
    v.tintFlash(0x6bff7a, 300);
    this.audio.sfx("scratch", 0.4);
  }

  private async playEvent(e: BattleEvent): Promise<void> {
    switch (e.t) {
      case "trigger": {
        const v = this.view(e.uid);
        if (!v) return;
        v.pulse(1.2, 120);
        floater(this, v.x, v.y - 74, TRIGGER_TEXT[e.trigger], "#ffffff", 16, 650);
        this.audio.sfx("pluck", 0.3, 1.2);
        await this.wait(260);
        return;
      }
      case "buff": {
        const v = this.view(e.uid);
        if (!v) return;
        v.setStats(Math.max(0, v.atk + e.atk), v.hp + e.hp);
        const label = e.atk && e.hp ? `+${e.atk}/+${e.hp}` : e.atk ? `+${e.atk} atk` : `+${e.hp} hp`;
        floater(this, v.x, v.y - 56, label, COLOR.green, 22, 600);
        v.tintFlash(0x9dffb0);
        burst(this, v.x, v.y, "fx_star_04", 5, 0x9dffb0, 90);
        this.audio.sfx("confirm", 0.25, 1.3);
        await this.wait(190);
        return;
      }
      case "status": {
        const v = this.view(e.uid);
        if (!v) return;
        ring(this, v.x, v.y, e.status === "barrier" ? 0x6fd0ff : 0x6bff7a, 2.2);
        const cur = [...(e.status === "barrier" ? ["barrier"] : ["venom"])] as ("barrier" | "venom")[];
        v.setStatuses(cur);
        this.audio.sfx("latch", 0.3);
        await this.wait(190);
        return;
      }
      case "damage": {
        // damage from an ability: it flies in from its source
        const target = this.view(e.uid);
        const src = e.src !== undefined ? this.view(e.src) : undefined;
        if (!target) return;
        if (src) {
          await new Promise<void>((resolve) => {
            if (this.skipRequested) return resolve();
            shoot(this, { x: src.x, y: src.y - 10 }, { x: target.x, y: target.y - 10 }, "fx_flame_03", 0xffa860, 240 / this.speed, () => resolve());
          });
        }
        this.applyDamage(e);
        this.audio.sfx("hit_soft", 0.45);
        burst(this, target.x, target.y, "fx_flame_01", 6, 0xffa860, 120);
        await this.wait(140);
        return;
      }
      case "barrier":
        this.applyBarrier(e.uid);
        await this.wait(160);
        return;
      case "venom":
        this.applyVenom(e.uid);
        await this.wait(160);
        return;
      case "faint": {
        const v = this.view(e.uid);
        if (!v) return;
        v.stopBob();
        this.audio.sfx("hit_soft", 0.4, 0.7);
        burst(this, v.x, v.y, "fx_smoke_01", 8, 0xcccccc, 80);
        await this.tween({ targets: v, y: v.y + 24, alpha: 0, angle: v.x < W / 2 ? -80 : 80, duration: 320, ease: "Quad.easeIn" });
        v.destroy();
        this.views.delete(e.uid);
        return;
      }
      case "summon": {
        // the view appears at the next sync, from the snapshot; leave a short beat so the pop-in is noticed
        this.audio.sfx("levelup", 0.4, 1.2);
        await this.wait(200);
        return;
      }
      case "revive": {
        this.audio.sfx("levelup", 0.5, 0.8);
        await this.wait(260);
        return;
      }
      default:
        return;
    }
  }

  // ---- the ending -----------------------------------------------------------------------

  private async finish(): Promise<void> {
    this.finished = true;
    this.skipButton.setEnabled(false);
    const { outcome } = this.result.battle;
    const after = this.result.run;
    const final = after.phase !== "shop";
    for (const t of this.bondTags) t.destroy();

    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(800);
    this.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 300 });
    const title = outcome === "win" ? "VICTORY!" : outcome === "lose" ? "DEFEAT" : "DRAW";
    const color = outcome === "win" ? COLOR.gold : outcome === "lose" ? COLOR.red : COLOR.cream;
    if (outcome === "win") this.audio.music("victory", false);
    else if (outcome === "lose") this.audio.music("defeat", false);
    else this.audio.sfx("bong", 0.6);

    const box = panel(this, W / 2 - 250, 150, 500, 250, "ui_ancient_brown").setDepth(810).setAlpha(0);
    const head = text(this, W / 2, 196, title, 64, color, { stroke: "#2a1f1a", strokeThickness: 12 }).setOrigin(0.5).setDepth(820).setScale(0.3).setAlpha(0);
    const lines: string[] = [];
    const boss = BOSS_ROUNDS.includes(this.before.round);
    if (outcome === "win") lines.push(boss ? `${bossName(this.before.round)} is beaten!` : `Round ${this.before.round} cleared.`);
    else if (outcome === "lose") lines.push(after.lives < this.before.lives ? `You lose a life. ${after.lives} left.` : "Defeated.");
    else lines.push(after.lives < this.before.lives ? "A drawn final counts against you. You lose a life." : "Neither side prevails. No life lost.");
    if (after.phase === "won") lines.push("You are the champion of the Tourney!");
    if (after.phase === "lost") lines.push("Your run ends here.");
    const body = text(this, W / 2, 262, lines.join("\n"), 24, COLOR.cream, { align: "center", wordWrap: { width: 440 }, lineSpacing: 6 }).setOrigin(0.5, 0).setDepth(820).setAlpha(0);
    this.tweens.add({ targets: [box, body], alpha: 1, duration: 260 });
    this.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 360, ease: "Back.easeOut" });
    if (outcome === "win") for (let i = 0; i < 4; i++) this.time.delayedCall(i * 140, () => burst(this, 300 + i * 120, 180, "fx_star_01", 16, 0xffe27a, 240, 830));

    // hearts
    const hearts = this.add.container(0, 0).setDepth(820);
    const max = { squire: 5, knight: 4, champion: 3 }[after.difficulty];
    for (let i = 0; i < max; i++) {
      const h = this.add.image(W / 2 - ((max - 1) * 36) / 2 + i * 36, 346, "icons", 195).setScale(2.6);
      if (i >= after.lives) h.setTint(0x3a3040);
      hearts.add(h);
      if (i === after.lives && after.lives < this.before.lives) this.tweens.add({ targets: h, scale: 3.6, alpha: 0.2, duration: 600, yoyo: false, delay: 500 });
    }

    const label = final ? (after.phase === "won" ? "Celebrate!" : "Continue") : "Continue";
    button(this, W / 2, 392, label, () => this.next(), { w: 240, h: 52, color: "green", size: 28 }).setDepth(830);
    this.input.keyboard?.once("keydown-ENTER", () => this.next());
    this.input.keyboard?.once("keydown-SPACE", () => this.next());
  }

  private next(): void {
    if (this.scene.isActive("Battle") === false) return;
    const after = this.result.run;
    this.session.update(after);
    if (after.phase !== "shop") {
      this.session.finish();
      this.scene.start("End", { run: after, history: after.history });
    } else {
      this.scene.start("Shop");
    }
  }

  private exposeDebug(): void {
    const w = window as unknown as { __tourney?: Record<string, unknown> };
    if (!w.__tourney) return;
    w.__tourney.battle = { result: () => this.result, finished: () => this.finished, skip: () => this.skip(), views: () => this.views.size };
  }
}
void relicDef;
