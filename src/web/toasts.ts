/** Trophy banners. Trophies are earned in one scene and shown in the next, so they wait in the registry. */

import Phaser from "phaser";

import { trophy } from "../engine/achievements.js";
import type { Audio } from "./audio.js";
import { burst } from "./fx.js";
import type { Session } from "./session.js";
import { COLOR, W, panel, text } from "./ui.js";
import { t, tn } from "../i18n/index.js";

const KEY = "pendingTrophies";

/** Record trophies as earned and queue the banners for whichever scene is up next. */
export function award(registry: Phaser.Data.DataManager, ids: string[]): void {
  const session = registry.get("session") as Session;
  const fresh = session.award(ids);
  if (fresh.length > 0) registry.set(KEY, [...((registry.get(KEY) as string[] | undefined) ?? []), ...fresh]);
}

/** Show whatever is waiting, one banner after the other. */
export function flushTrophies(scene: Phaser.Scene): void {
  const waiting = (scene.registry.get(KEY) as string[] | undefined) ?? [];
  scene.registry.set(KEY, []);
  waiting.forEach((id, i) => scene.time.delayedCall(500 + i * 2600, () => banner(scene, id)));
}

function banner(scene: Phaser.Scene, id: string): void {
  const def = trophy(id);
  if (!def || !scene.sys.isActive()) return;
  const audio = scene.registry.get("audio") as Audio;
  audio.sfx("levelup", 0.7, 1.1);
  const box = panel(scene, W / 2 - 220, -90, 440, 76, "ui_ancient_tan").setDepth(3000);
  const star = scene.add.image(W / 2 - 190, -52, "star").setScale(3.4).setDepth(3001);
  const head = text(scene, W / 2 - 160, -84, tn(def.points, "Challenge complete  ·  +{n} skill point", "Challenge complete  ·  +{n} skill points"), 16, "#6b4a2f").setDepth(3001);
  const name = text(scene, W / 2 - 160, -62, t(def.name), 26, COLOR.dark).setDepth(3001);
  const parts = [box, star, head, name];
  const drop = 100;
  scene.tweens.add({ targets: parts, y: `+=${drop}`, duration: 350, ease: "Back.easeOut" });
  burst(scene, W / 2 - 190, 48, "fx_star_01", 12, 0xffe27a, 150, 3002);
  scene.time.delayedCall(2100, () => scene.tweens.add({ targets: parts, y: `-=${drop}`, duration: 300, onComplete: () => parts.forEach((o) => o.destroy()) }));
}
