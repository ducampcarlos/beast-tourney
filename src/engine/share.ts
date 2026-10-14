/**
 * The text that is copied when a run ends: a one-line verdict and a trail of coloured squares,
 * one per round (green win, blue boss win, yellow draw, red loss).
 */
import type { Run } from "./run.js";

export function roundTrail(history: Run["history"]): string {
  return history
    .map((h) => (h.outcome === "win" ? (h.boss ? "🟦" : "🟩") : h.outcome === "draw" ? "🟨" : "🟥"))
    .join("");
}

export function shareText(run: Run): string {
  const won = run.phase === "won";
  const wins = run.history.filter((h) => h.outcome === "win").length;
  const verdict = run.endless ? `Endless depth ${run.round}` : won ? "Champion" : `Out in round ${run.round}`;
  return `Beast Tourney - ${run.difficulty}, seed ${run.seed}\n${verdict} - ${wins} rounds won, ${run.lives} lives left\n${roundTrail(run.history)}`;
}
