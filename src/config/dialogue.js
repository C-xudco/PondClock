export const DIALOGUE_CONFIG = Object.freeze({
  bubbleMs: 4600, recentGlobal: 8, recentEvent: 3,
  pokeWindowMs: 10000, pokeCount: 5, pokeQuietMs: 45000,
  ordinaryPokeMs: 6000, escalatedPokeMs: 8000,
  arrivalWeights: Object.freeze({ impression: 4, scenery: 3, fish: 3 }),
  priority: Object.freeze({ idle: 1, impatient: 2, poke1: 2, poke2: 2, poke3: 2, arrival: 3,
    success: 4, rare: 4, high: 4, miss: 4, item: 4 }),
});
