import type { FaceExpressions } from "face-api.js";

/** Same mapping as the DeepFace hackathon snippet; face-api.js uses `fearful` instead of `fear`. */
export const STRESS_WEIGHTS: Record<string, number> = {
  angry: 1.0,
  fearful: 0.9,
  sad: 0.7,
  disgusted: 0.6,
  neutral: 0.2,
  happy: -0.5,
  surprised: 0.1,
};

const EXPRESSION_KEYS = Object.keys(STRESS_WEIGHTS) as (keyof FaceExpressions)[];

/**
 * Weighted stress estimate from emotion probabilities (each in [0, 1]).
 * Matches the DeepFace pipeline: sum(weight * prob); DeepFace percentages are converted to probs by /100.
 */
export function stressScoreFromExpressions(ex: FaceExpressions): number {
  let s = 0;
  for (const k of EXPRESSION_KEYS) {
    s += STRESS_WEIGHTS[k] * (ex[k] ?? 0);
  }
  return s;
}

export function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
