// Existing species, equipment and catch weights remain in gameConfig.js.
// This file owns the previously scattered pacing and starting-state values.
export {
  RODS, JUDGE, BITE, BAIT_COST, BAIT_CATCHES, BAIT_QUALITY_BONUS, PITY_THRESHOLD,
} from "../lib/gameConfig.js";

export const FISHING_CONFIG = Object.freeze({
  startCoins: 100,
  startBait: 2,
  speechMs: 4600,
  waitFloorSeconds: 25,
  idleBoostMax: 0.12,
  idleBoostPerHour: 0.04,
  firstSpeechMinSeconds: 30,
  firstSpeechMaxSeconds: 60,
  speechMinSeconds: 35,
  speechMaxSeconds: 75,
  pokeWindowMs: 10000,
  pokeCount: 5,
  qualityBonusRate: Object.freeze({ rare: 1, epic: 0.3, legendary: 0.1 }),
  pityWeightMultiplier: 5,
});
