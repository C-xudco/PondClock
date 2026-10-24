import { DIALOGUE_CONFIG as C } from '../config/dialogue.js';
import { DIALOGUE_CATALOG, REGION_DIALOGUE, FISH_ARRIVAL_TEMPLATES } from '../data/dialogueCatalog.js';

const boundedRandom = (random) => Math.min(1 - Number.EPSILON, Math.max(0, random()));
export class DialogueDirector {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.recent = [];
    this.recentByEvent = new Map();
    this.bags = new Map();
    this.reset();
  }
  reset() {
    this.pokes = []; this.stage = 0; this.lastPokeAt = -Infinity;
    this.lastOrdinaryAt = -Infinity; this.lastEscalatedAt = -Infinity;
    this.activeUntil = 0; this.activePriority = 0;
  }
  choose(event, lines) {
    if (!lines?.length) return null;
    const last = this.recent.at(-1);
    const eventRecent = this.recentByEvent.get(event) || [];
    let bag = this.bags.get(event);
    if (!bag?.size || !lines.some((line) => bag.has(line.id))) bag = new Set(lines.map((line) => line.id));
    const chooseEligible = (excludeEvent, excludeGlobal) => lines.filter((line) => bag.has(line.id)
      && line.id !== last && (!excludeEvent || !eventRecent.includes(line.id)) && (!excludeGlobal || !this.recent.includes(line.id)));
    let eligible = chooseEligible(true, true);
    if (!eligible.length) eligible = chooseEligible(false, true);
    if (!eligible.length) eligible = chooseEligible(false, false);
    if (!eligible.length) {
      bag = new Set(lines.map((line) => line.id));
      eligible = lines.filter((line) => line.id !== last);
    }
    if (!eligible.length) return null;
    let cursor = boundedRandom(this.random) * eligible.reduce((sum, line) => sum + (line.weight || 1), 0);
    const chosen = eligible.find((line) => (cursor -= line.weight || 1) < 0) || eligible.at(-1);
    bag.delete(chosen.id); this.bags.set(event, bag);
    this.recent = [...this.recent, chosen.id].slice(-C.recentGlobal);
    this.recentByEvent.set(event, [...eventRecent, chosen.id].slice(-C.recentEvent));
    return chosen;
  }
  speak(event, nowMs, { lines, tone = event, priority = C.priority[event] || 1 } = {}) {
    if (nowMs < this.activeUntil && priority < this.activePriority) return null;
    const line = this.choose(event, lines || DIALOGUE_CATALOG[event]);
    if (!line) return null;
    this.activeUntil = nowMs + C.bubbleMs; this.activePriority = priority;
    return { text: line.text, tone, id: `${line.id}:${nowMs}`, lineId: line.id, expiresAtMs: this.activeUntil };
  }
  poke(nowMs) {
    if (nowMs - this.lastPokeAt >= C.pokeQuietMs) {
      this.pokes = []; this.stage = 0; this.lastOrdinaryAt = -Infinity; this.lastEscalatedAt = -Infinity;
    }
    this.lastPokeAt = nowMs;
    this.pokes = [...this.pokes.filter((at) => nowMs - at <= C.pokeWindowMs), nowMs];
    if (this.pokes.length >= C.pokeCount) {
      this.pokes = []; this.stage = Math.min(3, this.stage + 1);
      if (nowMs - this.lastEscalatedAt < C.escalatedPokeMs) return null;
      const result = this.speak(`poke${this.stage}`, nowMs, { tone: 'miss' });
      if (result) this.lastEscalatedAt = nowMs;
      return result;
    }
    if (nowMs - this.lastOrdinaryAt < C.ordinaryPokeMs) return null;
    const result = this.speak('impatient', nowMs, { tone: 'idle' });
    if (result) this.lastOrdinaryAt = nowMs;
    return result;
  }
  arrival(regionId, nowMs, fishNames = []) {
    const weights = C.arrivalWeights;
    const value = boundedRandom(this.random) * (weights.impression + weights.scenery + weights.fish);
    const category = value < weights.impression ? 'impression' : value < weights.impression + weights.scenery ? 'scenery' : 'fish';
    const regionLines = REGION_DIALOGUE[regionId] || ['新水域到了，先坐稳，再看漂。'];
    const texts = category === 'fish' && fishNames.length ? FISH_ARRIVAL_TEMPLATES
      : category === 'impression' ? regionLines.slice(0, 2) : regionLines.slice(2);
    const speech = this.speak('arrival', nowMs, { tone: 'idle', lines: texts.map((text, index) =>
      ({ id: `arrival.${regionId}.${category}.${index}`, text, weight: 1 + index % 3 })) });
    if (speech && category === 'fish' && fishNames.length) {
      return { ...speech, text: speech.text.replace('{fish}', fishNames[Math.floor(boundedRandom(this.random) * fishNames.length)]) };
    }
    return speech;
  }
}
