/**
 * The text that is copied when a run ends: a one-line verdict and a trail of coloured squares,
 * one per round (green win, blue boss win, yellow draw, red loss).
 */
import { oath } from "./data.js";
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
  const vows = run.oaths.length > 0 ? `, oaths: ${run.oaths.map((id) => oath(id).name).join(" + ")}` : "";
  return `Beast Tourney - ${run.difficulty}, seed ${run.seed}${vows}\n${verdict} - ${wins} rounds won, ${run.lives} lives left\n${roundTrail(run.history)}`;
}
