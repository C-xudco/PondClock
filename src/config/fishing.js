// Existing species, equipment and catch weights remain in gameConfig.js.
// This file owns the previously scattered pacing and starting-state values.
import { DIALOGUE_CONFIG } from './dialogue.js';
export {
  RODS, JUDGE, BITE, BAIT_COST, BAIT_CATCHES, BAIT_QUALITY_BONUS, PITY_THRESHOLD,
} from "../lib/gameConfig.js";

export const FISHING_CONFIG = Object.freeze({
  startCoins: 100,
  startBait: 2,
  speechMs: DIALOGUE_CONFIG.bubbleMs,
  waitFloorSeconds: 25,
  idleBoostMax: 0.12,
  idleBoostPerHour: 0.04,
  firstSpeechMinSeconds: 30,
  firstSpeechMaxSeconds: 60,
  speechMinSeconds: 35,
  speechMaxSeconds: 75,
  pokeWindowMs: DIALOGUE_CONFIG.pokeWindowMs,
  pokeCount: DIALOGUE_CONFIG.pokeCount,
  qualityBonusRate: Object.freeze({ rare: 1, epic: 0.3, legendary: 0.1 }),
  pityWeightMultiplier: 5,
});
