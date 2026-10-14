/** Short visual effects built from the Kenney particle textures. All of them clean up after themselves. */

import Phaser from "phaser";

export function burst(scene: Phaser.Scene, x: number, y: number, texture: string, count = 14, tint = 0xffffff, speed = 160, depth = 400): void {
  const emitter = scene.add.particles(x, y, texture, {
    speed: { min: speed * 0.4, max: speed },
    angle: { min: 0, max: 360 },
    scale: { start: 0.45, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 520,
    tint,
    emitting: false,
    blendMode: "ADD",
  });
  emitter.setDepth(depth);
  emitter.explode(count);
  scene.time.delayedCall(700, () => emitter.destroy());
}

/** An expanding ring, for level-ups and barriers. */
export function ring(scene: Phaser.Scene, x: number, y: number, tint = 0xffe27a, size = 2.6, depth = 400): void {
  const r = scene.add.image(x, y, "fx_circle_05").setTint(tint).setAlpha(0.9).setScale(0.3).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: r, scale: size, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
}

/** A projectile that flies from one point to another, then calls back. */
export function shoot(scene: Phaser.Scene, from: { x: number; y: number }, to: { x: number; y: number }, texture: string, tint: number, duration: number, onArrive: () => void): void {
  const p = scene.add.image(from.x, from.y, texture).setTint(tint).setScale(0.55).setDepth(450).setBlendMode(Phaser.BlendModes.ADD);
  p.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
  scene.tweens.add({
    targets: p,
    x: to.x,
    y: to.y,
    duration,
    ease: "Quad.easeIn",
    onComplete: () => {
      p.destroy();
      onArrive();
    },
  });
}

export function shake(scene: Phaser.Scene, strength = 0.004, duration = 120): void {
  const session = scene.registry.get("session") as { profile: { shake: boolean } } | undefined;
  if (session && !session.profile.shake) return;
  scene.cameras.main.shake(duration, strength);
}
