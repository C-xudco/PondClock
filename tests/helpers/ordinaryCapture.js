import { applyCommand } from '../../src/domain/gameState.js';
import { catchOutcome } from '../../src/domain/loot.js';

let sequence = 0;
const action = (type, fields = {}) => ({ id: `fixture:ordinary:${++sequence}`, type, ...fields });

// Exercise the real waiting/bite transaction rather than injecting CATCH payloads.
export function openBite(state, { useBait = true, now = state.lastEffectiveNowMs } = {}) {
  const waiting = applyCommand(state, action('START_FISHING', { useBait }), now);
  return applyCommand(waiting, action('OPEN_BITE'), waiting.fishing.attempt.waitUntilMs);
}

export function captureCommand(opened, fields = {}) {
  return action('RESOLVE_BITE', { attemptId: opened.fishing.attempt.id, manual: true, ...fields });
}

export function capture(opened, fields = {}) {
  return applyCommand(opened, captureCommand(opened, fields), opened.lastEffectiveNowMs);
}

export function outcomeForBite(opened) {
  return catchOutcome(opened, { attemptSeed: opened.fishing.attempt.seed, useBait: opened.fishing.useBait });
}

export function findBite(factory, kind, options) {
  for (let seed = 0; seed < 50000; seed++) {
    const opened = openBite(factory(seed), options);
    const outcome = outcomeForBite(opened);
    if ((outcome.kind === 'fish' ? 'fish' : outcome.item.type) === kind) return opened;
  }
  throw new Error(`No deterministic ordinary fixture found for ${kind}`);
}

export async function sessionBite(session, time, prefix) {
  const waiting = await session.dispatch({ type: 'START_FISHING', useBait: true, id: `${prefix}:start` });
  time.wall = waiting.fishing.attempt.waitUntilMs;
  return session.dispatch({ type: 'OPEN_BITE', id: `${prefix}:bite` });
}
