import Phaser from "phaser";

import { FACTION_DEFS, bondNeed, boon as boonDef, relic as relicDef, species } from "../engine/data.js";
import { newTrophies } from "../engine/achievements.js";
import { MAX_ROUNDS, bossName, dominantFaction, enemyTeam, isBossRound } from "../engine/enemy.js";
import { LIVES, BUY_COST, type Result, type Run, type ShopEvent, buy, buyRelic, fight, move, relicCost, roll, rollCost, sell, sellGold, teamUnits, toggleFreeze } from "../engine/run.js";
import { describeAbility, STATUS_TEXT } from "../engine/text.js";
import { FACTIONS, SLOTS, type FactionId, type Unit } from "../engine/types.js";
import type { Audio } from "./audio.js";
import { CreatureView } from "./creature.js";
import { burst, ring } from "./fx.js";
import type { Session } from "./session.js";
import { HELP_LINES } from "./help.js";
import { award, flushTrophies } from "./toasts.js";
import { COLOR, H, W, backdrop, button, fadeIn, floater, go, lighten, overlay, panel, text, toast, type Button } from "./ui.js";

// ---- layout --------------------------------------------------------------------------------
const SLOT_W = 128;
const SLOT_GAP = 8;
const SLOT_Y = 178;
const slotX = (i: number): number => 24 + SLOT_W / 2 + (SLOTS - 1 - i) * (SLOT_W + SLOT_GAP); // slot 0 (front) is the rightmost
const CARD_W = 120;
const CARD_Y = 372;
const cardX = (i: number): number => 42 + CARD_W / 2 + i * (CARD_W + 8);
const RELIC_X = [800, 890];
const RELIC_Y = 448;
const SHOP_RECT = new Phaser.Geom.Rectangle(16, 262, 684, 222);

type Selection = { kind: "unit"; slot: number } | { kind: "offer"; index: number } | { kind: "relic"; index: number } | { kind: "boon"; index: number } | { kind: "enemy"; index: number } | null;

export class Shop extends Phaser.Scene {
  private session!: Session;
  private audio!: Audio;
  private run!: Run;

  private teamViews: Array<CreatureView | null> = [];
  private slotBgs: Phaser.GameObjects.NineSlice[] = [];
  private offerViews: Array<CreatureView | null> = [];
  private offerBgs: Phaser.GameObjects.NineSlice[] = [];
  private offerExtras: Phaser.GameObjects.GameObject[] = [];
  private relicExtras: Phaser.GameObjects.GameObject[] = [];
  private relicIcons: Array<Phaser.GameObjects.Image | null> = [];
  private enemyExtras: Phaser.GameObjects.GameObject[] = [];
  private infoExtras: Phaser.GameObjects.GameObject[] = [];
  private topExtras: Phaser.GameObjects.GameObject[] = [];
  private sellZone!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private goldIcon!: Phaser.GameObjects.Image;
  private fightButton!: Button;
  private rollButton!: Button;
  private undoButton!: Button;
  private enemies: Unit[] = [];
  private history: Run[] = [];
  private selection: Selection = null;
  private hover: Selection = null;
  private busy = false;
  private lastQuickBuy = { kind: "", index: -1, at: 0 };

  constructor() {
    super("Shop");
  }

  create(): void {
    this.session = this.registry.get("session") as Session;
    this.audio = this.registry.get("audio") as Audio;
    if (!this.session.run || this.session.run.phase !== "shop") {
      this.scene.start("Menu");
      return;
    }
    this.run = this.session.run;
    if (this.run.pendingBoons) {
      this.scene.start("Boon");
      return;
    }
    fadeIn(this);
    // A scene object lives on between visits: everything is reset here, not in field initialisers.
    this.history = [];
    this.teamViews = Array(SLOTS).fill(null);
    this.slotBgs = [];
    this.offerViews = [];
    this.offerBgs = [];
    this.offerExtras = [];
    this.relicExtras = [];
    this.relicIcons = [];
    this.enemyExtras = [];
    this.infoExtras = [];
    this.topExtras = [];
    this.hoverClear = undefined;
    this.selection = null;
    this.hover = null;
    this.busy = false;
    this.audio.music(this.run.round % 2 === 0 ? "shop2" : "shop");

    backdrop(this, 1.2);
    this.buildChrome();
    this.rebuildAll(true);
    this.input.dragDistanceThreshold = 8; // a tap with a shaky finger is not a drag
    this.input.on("dragstart", this.onDragStart, this);
    this.input.on("drag", this.onDrag, this);
    this.input.on("dragend", this.onDragEnd, this);
    this.input.keyboard?.on("keydown-R", () => this.doRoll());
    this.input.keyboard?.on("keydown-F", () => this.doFight());
    this.input.keyboard?.on("keydown-Z", () => this.doUndo());
    this.input.keyboard?.on("keydown-M", () => this.toggleMute());
    this.events.once("shutdown", () => {
      this.input.off("dragstart", this.onDragStart, this);
      this.input.off("drag", this.onDrag, this);
      this.input.off("dragend", this.onDragEnd, this);
    });
    this.exposeDebug();
    flushTrophies(this);
    if (!this.session.profile.seenHelp && !new URLSearchParams(window.location.search).has("nohelp")) {
      this.session.profile.seenHelp = true;
      this.session.saveProfile();
      this.time.delayedCall(350, () => overlay(this, "How to play", HELP_LINES));
    }
  }

  // ---- static chrome --------------------------------------------------------------------

  private buildChrome(): void {
    // team slots
    for (let i = 0; i < SLOTS; i++) {
      const bg = this.add.nineslice(slotX(i) - SLOT_W / 2, SLOT_Y - 70, "ui_ancient_brown_inlay", undefined, SLOT_W / 2, 140 / 2, 16, 16, 16, 16).setOrigin(0, 0).setScale(2).setDepth(-1);
      this.slotBgs.push(bg);
    }
    text(this, slotX(0), SLOT_Y + 80, "FRONT", 16, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);
    text(this, slotX(SLOTS - 1), SLOT_Y + 80, "BACK", 16, COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);
    const arrow = text(this, slotX(0) + SLOT_W / 2 + 18, SLOT_Y, "▶", 28, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0.5);
    this.tweens.add({ targets: arrow, x: arrow.x + 6, duration: 500, yoyo: true, repeat: -1 });

    // shop panel
    panel(this, SHOP_RECT.x, SHOP_RECT.y, SHOP_RECT.width, SHOP_RECT.height, "ui_ancient_brown").setDepth(-2);
    text(this, 34, 270, "Creatures for sale", 20, COLOR.cream);

    // right column
    panel(this, 716, 60, 228, 122, "ui_ancient_brown").setDepth(-2);
    panel(this, 716, 190, 228, 214, "ui_ancient_brown").setDepth(-2);
    panel(this, 716, 412, 228, 76, "ui_ancient_brown").setDepth(-2);
    text(this, 726, 424, "Relics", 18, COLOR.cream);

    // top bar
    panel(this, 0, 0, W, 54, "ui_ancient_brown").setDepth(-2);
    this.goldIcon = this.add.image(838, 27, "coin").setScale(3);
    this.goldText = text(this, 860, 26, "", 30, COLOR.gold, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);

    // buttons
    this.rollButton = button(this, 118, 514, "Roll  (1)", () => this.doRoll(), { w: 200, h: 44, color: "blue", size: 22 }) as Button;
    this.undoButton = button(this, 262, 514, "Undo", () => this.doUndo(), { w: 76, h: 44, color: "yellow", size: 18 }) as Button;
    button(this, 350, 514, "Menu", () => go(this, "Menu"), { w: 84, h: 44, color: "grey", size: 18 });
    this.fightButton = button(this, 826, 514, "FIGHT!", () => this.doFight(), { w: 220, h: 48, color: "green", size: 28 }) as Button;
    text(this, 566, 514, "Drag creatures onto the board. Three of a kind merge.", 16, COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0.5);

    // sell zone (only shown while dragging a team member)
    const zone = this.add.rectangle(SHOP_RECT.centerX, SHOP_RECT.centerY, SHOP_RECT.width - 12, SHOP_RECT.height - 12, 0x7a1f2a, 0.82).setStrokeStyle(4, 0xe0584a);
    const label = text(this, SHOP_RECT.centerX, SHOP_RECT.centerY, "", 34, "#ffffff", { stroke: "#2a1f1a", strokeThickness: 6, align: "center" }).setOrigin(0.5);
    this.sellZone = this.add.container(0, 0, [zone, label]).setDepth(50).setVisible(false);
    this.sellZone.setData("label", label);
  }

  // ---- rebuilding views -----------------------------------------------------------------

  private rebuildAll(initial = false): void {
    this.refreshTop();
    this.refreshTeam(initial);
    this.refreshOffers(initial);
    this.refreshRelics();
    this.refreshEnemy();
    this.refreshInfo();
    const any = teamUnits(this.run).length > 0;
    this.fightButton.setEnabled(any);
    const cost = rollCost(this.run);
    this.rollButton.setLabel(cost === 0 ? "Roll  (free)" : `Roll  (${cost})`);
    this.rollButton.setEnabled(this.run.gold >= cost);
    this.undoButton.setEnabled(this.history.length > 0);
  }

  private refreshTop(): void {
    for (const o of this.topExtras) o.destroy();
    this.topExtras = [];
    const run = this.run;
    const boss = isBossRound(run.round);
    const round = text(this, 18, 26, run.endless ? `Round ${run.round}` : `Round ${run.round}/${MAX_ROUNDS}`, 28, COLOR.cream, { stroke: "#2a1f1a", strokeThickness: 6 }).setOrigin(0, 0.5);
    this.topExtras.push(round);
    if (boss) this.topExtras.push(text(this, 200, 26, `BOSS: ${bossName(run.round)}`, 22, COLOR.red, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5));
    // lives as hearts
    const hearts = Math.max(LIVES[run.difficulty], run.lives);
    for (let i = 0; i < hearts; i++) {
      const h = this.add.image(560 + i * 34, 27, "icons", 195).setScale(2.4);
      if (i >= run.lives) h.setTint(0x3a3040).setAlpha(0.7);
      this.topExtras.push(h);
    }
    run.boons.forEach((id, i) => {
      const icon = this.add.image(716 + i * 40, 27, "dungeon", boonDef(id).icon).setScale(2.4).setInteractive({ useHandCursor: true });
      icon.on("pointerover", () => this.setHover({ kind: "boon", index: i }));
      icon.on("pointerout", () => this.setHover(null));
      this.topExtras.push(icon);
    });
    this.goldText.setText(String(run.gold));
  }

  private slotSelected(i: number): boolean {
    return this.selection?.kind === "unit" && this.selection.slot === i;
  }

  private refreshTeam(initial: boolean): void {
    const units = this.run.team;
    const live = new Set(units.filter((u): u is Unit => u !== null).map((u) => u.uid));
    this.teamViews.forEach((v, i) => {
      if (v && !live.has(v.uid)) {
        v.destroy();
        this.teamViews[i] = null;
      }
    });
    const byUid = new Map<number, CreatureView>();
    for (const v of this.teamViews) if (v) byUid.set(v.uid, v);
    const next: Array<CreatureView | null> = Array(SLOTS).fill(null);
    units.forEach((u, i) => {
      if (!u) return;
      let v = byUid.get(u.uid);
      if (!v) {
        v = this.makeTeamView(u, i);
        if (!initial) this.popIn(v);
      } else {
        v.setStats(u.atk, u.hp);
        v.setLevel(u.level, u.exp);
        v.setRelic(u.relic);
        this.tweens.add({ targets: v, x: slotX(i), y: SLOT_Y, duration: 140, ease: "Quad.easeOut" });
      }
      v.setData("slot", i);
      next[i] = v;
    });
    this.teamViews = next;
  }

  private makeTeamView(u: Unit, slot: number): CreatureView {
    const v = new CreatureView(this, slotX(slot), SLOT_Y, { sp: u.sp, level: u.level, exp: u.exp, atk: u.atk, hp: u.hp, relic: u.relic });
    v.uid = u.uid;
    v.setDepth(10);
    v.setInteractive(new Phaser.Geom.Rectangle(-42, -48, 84, 104), Phaser.Geom.Rectangle.Contains);
    v.input!.cursor = "grab";
    this.input.setDraggable(v);
    v.setData("kind", "unit");
    v.on("pointerover", () => this.setHover({ kind: "unit", slot: v.getData("slot") as number }));
    v.on("pointerout", () => this.setHover(null));
    v.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - p.downX) < 6 && Math.abs(p.y - p.downY) < 6) this.clickUnit(v.getData("slot") as number);
    });
    return v;
  }

  private popIn(v: Phaser.GameObjects.Container): void {
    v.setScale(0.2);
    this.tweens.add({ targets: v, scale: 1, duration: 260, ease: "Back.easeOut" });
  }

  private refreshOffers(initial: boolean): void {
    for (const o of this.offerExtras) o.destroy();
    this.offerExtras = [];
    for (const v of this.offerViews) v?.destroy();
    for (const b of this.offerBgs) b.destroy();
    this.offerBgs = [];
    this.offerViews = [];
    const offers = this.run.offers;
    offers.forEach((offer, i) => {
      const bg = this.add.nineslice(cardX(i) - CARD_W / 2, CARD_Y - 68, "ui_ancient_tan_inlay", undefined, CARD_W / 2, 136 / 2, 16, 16, 16, 16).setOrigin(0, 0).setScale(2).setDepth(-1);
      this.offerBgs.push(bg);
      if (!offer) {
        this.offerViews.push(null);
        return;
      }
      const sp = species(offer.sp);
      const v = new CreatureView(this, cardX(i), CARD_Y - 6, { sp: sp.id, atk: sp.atk, hp: sp.hp });
      v.setDepth(10);
      v.setInteractive(new Phaser.Geom.Rectangle(-42, -48, 84, 104), Phaser.Geom.Rectangle.Contains);
      v.input!.cursor = "grab";
      this.input.setDraggable(v);
      v.setData("kind", "offer").setData("index", i);
      v.on("pointerover", () => this.setHover({ kind: "offer", index: i }));
      v.on("pointerout", () => this.setHover(null));
      v.on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.abs(p.x - p.downX) < 6 && Math.abs(p.y - p.downY) < 6) this.clickOffer(i);
      });
      if (!initial) this.popIn(v);
      this.offerViews.push(v);
      // cost, tier and freeze
      const color = FACTION_DEFS[sp.faction].color;
      this.offerExtras.push(this.add.rectangle(cardX(i), CARD_Y - 64, CARD_W - 16, 4, color).setDepth(2));
      this.offerExtras.push(this.add.image(cardX(i) - 14, CARD_Y + 82, "coin").setScale(2));
      this.offerExtras.push(text(this, cardX(i) + 4, CARD_Y + 82, String(BUY_COST), 22, this.run.gold >= BUY_COST ? COLOR.gold : COLOR.red, { stroke: "#2a1f1a", strokeThickness: 5 }).setOrigin(0, 0.5));
      this.offerExtras.push(text(this, cardX(i) - CARD_W / 2 + 10, CARD_Y - 60, `T${sp.tier}`, 16, COLOR.muted, { stroke: "#2a1f1a", strokeThickness: 3 }));
      const lock = this.add.image(cardX(i) + CARD_W / 2 - 16, CARD_Y - 52, "icons", 193).setScale(2).setDepth(20).setAlpha(offer.frozen ? 1 : 0.35).setInteractive({ useHandCursor: true });
      lock.on("pointerup", () => this.doFreeze("creature", i));
      this.offerExtras.push(lock);
      if (offer.frozen) {
        bg.setTint(0xaad8ff);
        lock.setTint(0x9fe0ff);
      }
    });
  }

  private refreshRelics(): void {
    for (const o of this.relicExtras) o.destroy();
    this.relicExtras = [];
    this.relicIcons = [];
    this.run.relics.forEach((offer, i) => {
      if (!offer) {
        this.relicIcons.push(null);
        return;
      }
      const def = relicDef(offer.id);
      const slot = this.add.rectangle(RELIC_X[i]!, RELIC_Y, 58, 58, 0x3b2a1a, 0.9).setStrokeStyle(3, offer.frozen ? 0x9fe0ff : 0x7a5a38).setDepth(0);
      const icon = this.add.image(RELIC_X[i]!, RELIC_Y - 4, "dungeon", def.icon).setScale(3).setDepth(10);
      icon.setInteractive(new Phaser.Geom.Rectangle(-12, -12, 40, 40), Phaser.Geom.Rectangle.Contains);
      icon.input!.cursor = "grab";
      this.input.setDraggable(icon);
      icon.setData("kind", "relic").setData("index", i);
      icon.on("pointerover", () => this.setHover({ kind: "relic", index: i }));
      icon.on("pointerout", () => this.setHover(null));
      icon.on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.abs(p.x - p.downX) < 6 && Math.abs(p.y - p.downY) < 6) this.clickRelic(i);
      });
      this.relicIcons.push(icon);
      const coin = this.add.image(RELIC_X[i]! - 12, RELIC_Y + 34, "coin").setScale(1.6);
      const cost = text(this, RELIC_X[i]! - 2, RELIC_Y + 34, String(relicCost(this.run, def)), 18, this.run.gold >= relicCost(this.run, def) ? COLOR.gold : COLOR.red, { stroke: "#2a1f1a", strokeThickness: 4 }).setOrigin(0, 0.5);
      const lock = this.add.image(RELIC_X[i]! + 26, RELIC_Y - 28, "icons", 193).setScale(1.4).setAlpha(offer.frozen ? 1 : 0.35).setInteractive({ useHandCursor: true }).setDepth(20);
      lock.on("pointerup", () => this.doFreeze("relic", i));
      this.relicExtras.push(slot, icon, coin, cost, lock);
    });
    if (this.run.relics.length === 0) this.relicExtras.push(text(this, 830, RELIC_Y, "From round 2", 16, COLOR.muted).setOrigin(0.5));
  }

  private refreshEnemy(): void {
    for (const o of this.enemyExtras) o.destroy();
    this.enemyExtras = [];
    const run = this.run;
    const team = enemyTeam(run.seed, run.round, run.attempt, run.difficulty);
    this.enemies = team;
    this.session.noteSeen(team.map((u) => u.sp));
    const boss = bossName(run.round);
    this.enemyExtras.push(text(this, 728, 66, boss ? "Boss opponent" : "Next opponent", 18, boss ? COLOR.red : COLOR.cream));
    team.forEach((u, i) => {
      const sp = species(u.sp);
      const big = sp.tier === 6;
      const s = this.add.sprite(922 - i * 42, 112, "creatures", sp.frames[u.level - 1]).setScale(big ? 3.4 : 2.6).setFlipX(true).setDepth(5).setInteractive({ useHandCursor: true });
      s.on("pointerover", () => this.setHover({ kind: "enemy", index: i }));
      s.on("pointerout", () => this.setHover(null));
      s.on("pointerup", () => (this.selection = this.selection?.kind === "enemy" && this.selection.index === i ? null : { kind: "enemy", index: i }));
      this.enemyExtras.push(s);
    });
    const dom = dominantFaction(team);
    this.enemyExtras.push(text(this, 728, 150, boss ? boss : `Leans ${dom.name}`, 17, boss ? COLOR.red : COLOR.cream, { wordWrap: { width: 204 } }));
  }

  // ---- info panel -----------------------------------------------------------------------

  private hoverClear?: Phaser.Time.TimerEvent;

  /** Leaving a creature clears the details after a beat, so moving on to its Sell button does not rebuild the panel under the pointer. */
  private setHover(h: Selection): void {
    this.hoverClear?.remove();
    this.hoverClear = undefined;
    if (h === null) {
      this.hoverClear = this.time.delayedCall(140, () => {
        this.hover = null;
        this.refreshInfo();
      });
      return;
    }
    this.hover = h;
    this.refreshInfo();
  }

  private refreshInfo(): void {
    for (const o of this.infoExtras) o.destroy();
    this.infoExtras = [];
    const target = this.hover ?? this.selection;
    const x = 728;
    let y = 198;
    const add = (o: Phaser.GameObjects.GameObject) => this.infoExtras.push(o);
    const line = (content: string, size: number, color: string, gap = 4) => {
      const t = text(this, x, y, content, size, color, { wordWrap: { width: 204 }, lineSpacing: 2, stroke: "#2a1f1a", strokeThickness: 3 });
      add(t);
      y += t.height + gap;
      return t;
    };

    if (target?.kind === "unit" || target?.kind === "offer") {
      const info = target.kind === "unit" ? this.run.team[target.slot] : this.run.offers[target.index] ? { sp: this.run.offers[target.index]!.sp, level: 1, atk: species(this.run.offers[target.index]!.sp).atk, hp: species(this.run.offers[target.index]!.sp).hp, relic: undefined, exp: 0 } : null;
      if (info) {
        const sp = species(info.sp);
        const def = FACTION_DEFS[sp.faction];
        line(sp.name, 22, COLOR.gold);
        line(`${def.name}  ·  Tier ${sp.tier}  ·  Lv ${info.level}`, 16, lighten(def.color, 0.5));
        line(`Attack ${info.atk}   Health ${info.hp}`, 18, COLOR.cream, 8);
        if (sp.ability) line(describeAbility(sp.ability, info.level, sp.faction), 18, COLOR.cream, 8);
        if (info.relic) line(`${relicDef(info.relic).name}: ${relicDef(info.relic).text}`, 16, COLOR.blue, 6);
        if (sp.flavor) line(sp.flavor, 14, COLOR.muted);
        if (target.kind === "unit" && this.selection?.kind === "unit") this.sellButton(target.slot);
        return;
      }
    }
    if (target?.kind === "enemy") {
      const foe = this.enemies[target.index];
      if (foe) {
        const sp = species(foe.sp);
        line(sp.name, 22, COLOR.red);
        line(`Enemy  ·  ${FACTION_DEFS[sp.faction].name}  ·  Lv ${foe.level}`, 16, lighten(FACTION_DEFS[sp.faction].color, 0.5));
        const relicBonus = foe.relic ? relicDef(foe.relic) : undefined;
        line(`Attack ${foe.atk + (relicBonus?.atk ?? 0)}   Health ${foe.hp + (relicBonus?.hp ?? 0)}`, 18, COLOR.cream, 8);
        if (sp.ability) line(describeAbility(sp.ability, foe.level, sp.faction), 18, COLOR.cream, 8);
        if (relicBonus) line(`${relicBonus.name}: ${relicBonus.text}`, 16, COLOR.blue, 6);
        return;
      }
    }
    if (target?.kind === "boon") {
      const id = this.run.boons[target.index];
      if (id) {
        const def = boonDef(id);
        line(def.name, 22, COLOR.gold);
        line("Boon", 16, COLOR.blue, 6);
        line(def.text, 18, COLOR.cream);
        return;
      }
    }
    if (target?.kind === "relic") {
      const offer = this.run.relics[target.index];
      if (offer) {
        const def = relicDef(offer.id);
        line(def.name, 22, COLOR.gold);
        line(def.text, 18, COLOR.cream, 8);
        line("Drag it onto one of your creatures. A creature carries one relic.", 14, COLOR.muted);
        return;
      }
    }
    this.bondsPanel(x, y, add);
  }

  private sellButton(slot: number): void {
    const unit = this.run.team[slot];
    if (!unit) return;
    const b = button(this, 830, 382, `Sell  +${sellGold(this.run, unit)}`, () => this.doSell(slot), { w: 200, h: 36, color: "red", size: 18 });
    this.infoExtras.push(b);
  }

  private bondsPanel(x: number, y0: number, add: (o: Phaser.GameObjects.GameObject) => void): void {
    let y = y0;
    const title = text(this, x, y, "Bonds", 22, COLOR.gold);
    add(title);
    y += 28;
    const counts = new Map<FactionId, Set<string>>();
    for (const u of teamUnits(this.run)) {
      const f = species(u.sp).faction;
      (counts.get(f) ?? counts.set(f, new Set()).get(f)!).add(u.sp);
    }
    const active = FACTIONS.filter((f) => counts.has(f)).sort((a, b) => counts.get(b)!.size - counts.get(a)!.size);
    if (active.length === 0) {
      const needs = [bondNeed(2, this.run.boons), bondNeed(4, this.run.boons)];
      const t = text(this, x, y, `Field creatures of the same faction to awaken bonds: ${needs[0]} and ${needs[1]} different kinds.`, 17, COLOR.cream, { wordWrap: { width: 204 } });
      add(t);
      return;
    }
    for (const f of active.slice(0, 5)) {
      const def = FACTION_DEFS[f];
      const n = counts.get(f)!.size;
      add(text(this, x, y, `${def.name}`, 18, lighten(def.color, 0.5), { stroke: "#2a1f1a", strokeThickness: 3 }));
      // pips: filled up to n, with a gold edge on the ones that complete a bond
      const needLow = bondNeed(def.bonds[0].need, this.run.boons);
      const needHigh = bondNeed(def.bonds[1].need, this.run.boons);
      for (let i = 0; i < needHigh; i++) {
        const on = i < n;
        add(this.add.rectangle(x + 108 + i * 18, y + 10, 12, 12, on ? def.color : 0x3b2a1a).setStrokeStyle(2, i === needLow - 1 || i === needHigh - 1 ? 0xf2c14e : 0x2a1f1a));
      }
      const tier = n >= needHigh ? def.bonds[1] : n >= needLow ? def.bonds[0] : null;
      const tt = text(this, x, y + 20, tier ? tier.text : `Next: ${def.bonds[0].text}`, 15, tier ? COLOR.cream : COLOR.muted, { wordWrap: { width: 204 } });
      add(tt);
      y += 22 + tt.height + 4;
      if (y > 392) break;
    }
  }

  // ---- selection and quick actions ------------------------------------------------------

  private clickUnit(slot: number): void {
    if (this.selection?.kind === "relic") {
      this.doBuyRelic(this.selection.index, slot);
      this.selection = null;
      return;
    }
    this.selection = this.slotSelected(slot) ? null : { kind: "unit", slot };
    this.audio.sfx("select", 0.35);
    this.refreshInfo();
  }

  private clickOffer(index: number): void {
    const now = this.time.now;
    const again = this.lastQuickBuy.kind === "offer" && this.lastQuickBuy.index === index && now - this.lastQuickBuy.at < 600;
    this.lastQuickBuy = { kind: "offer", index, at: now };
    this.selection = { kind: "offer", index };
    this.audio.sfx("select", 0.35);
    this.refreshInfo();
    if (again) this.quickBuy(index);
  }

  private clickRelic(index: number): void {
    this.selection = this.selection?.kind === "relic" && this.selection.index === index ? null : { kind: "relic", index };
    this.audio.sfx("select", 0.35);
    this.refreshInfo();
    if (this.selection) toast(this, "Now click a creature to equip it", COLOR.blue);
  }

  /** Where a bought creature would go: onto a copy of itself, else the first empty slot from the front. */
  private quickBuy(index: number): void {
    const offer = this.run.offers[index];
    if (!offer) return;
    let slot = this.run.team.findIndex((u) => u?.sp === offer.sp);
    if (slot < 0) slot = this.run.team.findIndex((u) => u === null);
    if (slot < 0) {
      toast(this, "The team is full: sell or merge first");
      this.audio.sfx("error", 0.4);
      return;
    }
    this.doBuy(index, slot);
  }

  // ---- drag and drop --------------------------------------------------------------------

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    if (this.busy || !obj.active) return;
    const o = obj as Phaser.GameObjects.Container;
    o.setData("home", { x: o.x, y: o.y });
    o.setDepth(100);
    this.tweens.add({ targets: o, scale: 1.12, duration: 90 });
    (o as CreatureView).stopBob?.();
    this.audio.sfx("pluck", 0.4);
    if (o.getData("kind") === "unit") {
      const unit = this.run.team[o.getData("slot") as number];
      if (unit) this.showSellZone(`SELL  +${sellGold(this.run, unit)} gold`);
    }
  }

  private onDrag(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, x: number, y: number): void {
    if (!obj.active) return;
    const o = obj as Phaser.GameObjects.Container;
    o.x = x;
    o.y = y;
    const slot = this.slotAt(p.x, p.y);
    this.slotBgs.forEach((bg, i) => bg.setTint(i === slot ? 0xfff0a0 : 0xffffff));
    this.sellZone.setAlpha(SHOP_RECT.contains(p.x, p.y) ? 1 : 0.75);
  }

  private onDragEnd(p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    const o = obj as Phaser.GameObjects.Container;
    this.sellZone.setVisible(false);
    this.slotBgs.forEach((bg) => bg.clearTint());
    if (!o.active) return; // the view was replaced while it was being dragged
    const kind = o.getData("kind") as string;
    // Where the pointer is, not where the sprite last got to: the last move may not have been processed yet.
    const slot = this.slotAt(p.x, p.y);
    const home = o.getData("home") as { x: number; y: number };
    const snapBack = () => {
      if (!o.active) return;
      o.setDepth(10);
      this.tweens.add({ targets: o, x: home.x, y: home.y, scale: 1, duration: 140, ease: "Quad.easeOut", onComplete: () => o.active && (o as CreatureView).startBob?.() });
    };
    if (this.busy) return snapBack();
    if (kind === "offer") {
      if (slot < 0) return snapBack();
      if (!this.doBuy(o.getData("index") as number, slot)) snapBack();
    } else if (kind === "unit") {
      const from = o.getData("slot") as number;
      if (SHOP_RECT.contains(p.x, p.y)) return void (this.doSell(from) || snapBack());
      if (slot < 0 || slot === from) return snapBack();
      if (!this.doMove(from, slot)) snapBack();
    } else if (kind === "relic") {
      if (slot < 0) return snapBack();
      if (!this.doBuyRelic(o.getData("index") as number, slot)) snapBack();
    }
  }

  private slotAt(x: number, y: number): number {
    if (y < SLOT_Y - 74 || y > SLOT_Y + 74) return -1;
    for (let i = 0; i < SLOTS; i++) if (Math.abs(x - slotX(i)) <= SLOT_W / 2) return i;
    return -1;
  }

  private showSellZone(label: string): void {
    (this.sellZone.getData("label") as Phaser.GameObjects.Text).setText(label);
    this.sellZone.setVisible(true).setAlpha(0.75);
  }

  // ---- commands -------------------------------------------------------------------------

  private apply(r: Result, spot?: { x: number; y: number }): boolean {
    if (!r.ok) {
      toast(this, r.error);
      this.audio.sfx("error", 0.45);
      return false;
    }
    this.history.push(this.run);
    this.run = r.run;
    this.session.update(r.run);
    this.selection = null;
    this.rebuildAll();
    this.playEvents(r.events, spot);
    award(this.registry, newTrophies(this.session.profile.trophies, { team: r.run.team, boons: r.run.boons }));
    flushTrophies(this);
    return true;
  }

  /** Take back the last thing done this turn. A roll comes back identical if rolled again: the seed fixes it. */
  private doUndo(): void {
    if (this.busy) return;
    const previous = this.history.pop();
    if (!previous) return;
    this.run = previous;
    this.session.update(previous);
    this.selection = null;
    this.rebuildAll();
    this.audio.sfx("back", 0.5);
  }

  private toggleMute(): void {
    this.audio.setMuted(!this.audio.muted);
    this.session.profile.muted = this.audio.muted;
    this.session.saveProfile();
    toast(this, this.audio.muted ? "Sound off" : "Sound on", COLOR.cream);
  }

  private doBuy(offerIndex: number, slot: number): boolean {
    const was = this.run.team[slot];
    const ok = this.apply(buy(this.run, offerIndex, slot), { x: slotX(slot), y: SLOT_Y });
    if (ok) this.audio.sfx(was ? "levelup" : "coin", 0.5);
    return ok;
  }

  private doMove(from: number, to: number): boolean {
    const ok = this.apply(move(this.run, from, to), { x: slotX(to), y: SLOT_Y });
    if (ok) this.audio.sfx("drop", 0.5);
    return ok;
  }

  private doSell(slot: number): boolean {
    const unit = this.run.team[slot];
    if (!unit) return false;
    const ok = this.apply(sell(this.run, slot), { x: slotX(slot), y: SLOT_Y });
    if (ok) this.audio.sfx("coins", 0.55);
    return ok;
  }

  private doBuyRelic(index: number, slot: number): boolean {
    const ok = this.apply(buyRelic(this.run, index, slot), { x: slotX(slot), y: SLOT_Y });
    if (ok) {
      this.audio.sfx("latch", 0.6);
      burst(this, slotX(slot), SLOT_Y - 20, "fx_magic_01", 10, 0x9fd8ff, 120);
    }
    return ok;
  }

  private doRoll(): void {
    if (this.busy) return;
    const ok = this.apply(roll(this.run));
    if (ok) this.audio.sfx("flip", 0.5);
  }

  private doFreeze(kind: "creature" | "relic", index: number): void {
    const ok = this.apply(toggleFreeze(this.run, kind, index));
    if (ok) this.audio.sfx("toggle", 0.5);
  }

  private doFight(): void {
    if (this.busy) return;
    const result = fight(this.run);
    if (!result.ok) {
      toast(this, result.error);
      this.audio.sfx("error", 0.45);
      return;
    }
    this.busy = true;
    this.audio.sfx("draw", 0.6);
    go(this, "Battle", { before: this.run, result });
  }

  // ---- feedback -------------------------------------------------------------------------

  private playEvents(events: ShopEvent[], spot?: { x: number; y: number }): void {
    for (const e of events) {
      if (e.t === "gold") {
        floater(this, 880, 70, `${e.amount > 0 ? "+" : ""}${e.amount}`, COLOR.gold, 26);
        ring(this, 838, 27, 0xffd34d, 1.2, 60);
      } else if (e.t === "buff") {
        const view = this.teamViews.find((v) => v?.uid === e.uid);
        if (view) {
          const label = e.atk && e.hp ? `+${e.atk}/+${e.hp}` : e.atk ? `+${e.atk} atk` : `+${e.hp} hp`;
          floater(this, view.x, view.y - 56, label, COLOR.green, 24, 600);
          view.tintFlash(0x9dffb0);
          burst(this, view.x, view.y, "fx_star_04", 6, 0x9dffb0, 90);
        }
      } else if (e.t === "merge" && spot) {
        burst(this, spot.x, spot.y, "fx_star_01", 14, 0xffe27a, 170);
      } else if (e.t === "levelUp") {
        const view = this.teamViews.find((v) => v?.uid === e.uid);
        if (view) {
          ring(this, view.x, view.y, 0xffe27a, 3.2);
          floater(this, view.x, view.y - 60, "LEVEL UP!", COLOR.gold, 30, 600);
          view.pulse(1.25, 200);
        }
        this.audio.sfx("levelup", 0.7);
      }
    }
    if (spot && events.length === 0) burst(this, spot.x, spot.y, "fx_light_01", 4, 0xfff0b0, 60);
  }

  // ---- test hook ------------------------------------------------------------------------

  private exposeDebug(): void {
    const w = window as unknown as { __tourney?: Record<string, unknown> };
    if (!w.__tourney) return;
    w.__tourney.shop = {
      run: () => this.run,
      slotX,
      slotY: SLOT_Y,
      cardX,
      cardY: CARD_Y,
      relicX: RELIC_X,
      relicY: RELIC_Y,
      undo: () => this.doUndo(),
      history: () => this.history.length,
      reload: () => {
        this.run = this.session.run!;
        this.rebuildAll(true);
      },
    };
  }
}

