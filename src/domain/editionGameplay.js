import { QUALITIES, BAIT_CATCHES } from '../lib/gameConfig.js';
import { FOCUS_CONFIG } from '../config/focus.js';
import { ACTIVE_FISHING_CONFIG as A, gaugeBand, gaugePosition, quoteActivePass } from '../config/activeFishing.js';
import { assetRandom, catchOutcome, stableSeed } from './loot.js';

const onGround = state => { if (state.travel) throw new Error('飞行途中，请抵达后操作'); };
const rank = id => QUALITIES.find(q => q.id === id)?.rank ?? -1;
const increment = (value, name) => { if (!Number.isSafeInteger(value + 1)) throw new Error(`${name}已达上限`); return value + 1; };
const duration = command => {
  const elapsed = command.elapsedMs ?? 0;
  if (!Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed > FOCUS_CONFIG.maximumRuntimeGapMs) throw new Error('有效计时增量无效');
  return elapsed;
};

function makeAttempt(state, kind, now) {
  const sequence = increment(state.fishing.attemptSequence, '钓鱼尝试');
  const seed = stableSeed(`${state.randomSeed}:attempt:${sequence}:${kind}`);
  const base = { id: `attempt:${state.randomSeed}:${sequence}`, sequence, seed, kind, regionId: state.currentRegion };
  return kind === 'ordinary' ? { ...base, waitUntilMs: now + A.waitMinimumMs
    + Math.floor(assetRandom(seed, 'wait')() * (A.waitMaximumMs - A.waitMinimumMs + 1)), biteAtMs: null, deadlineMs: null }
    : { ...base, targetSwings: assetRandom(seed, 'swings')() < .5 ? 2 : 3,
      completedSwings: 0, nextSwingAtMs: now + A.swingMs };
}

export function stopFishing(state, preserveCast = false) {
  const attempt = preserveCast && state.fishing.phase === 'casting' ? state.fishing.attempt : null;
  return { ...state, fishing: { ...state.fishing, mode: 'stopped', phase: attempt ? 'casting' : 'stopped', attempt } };
}

function waitAgain(state, now) {
  const attempt = makeAttempt(state, 'ordinary', now);
  return { ...state, fishing: { ...state.fishing, mode: 'ordinary', phase: 'waiting',
    attemptSequence: attempt.sequence, attempt } };
}

function finishAttempt(state, now, success, active) {
  const attempt = state.fishing.attempt;
  let next = { ...state };
  let result = { attemptId: attempt.id, mode: active ? 'active' : 'ordinary', success,
    kind: 'miss', uid: null, atMs: now };
  if (success) {
    const outcome = catchOutcome(state, { active, useBait: !active && state.fishing.useBait, attemptSeed: attempt.seed });
    next.catchSequence = increment(state.catchSequence, '捕获次数');
    result = { ...result, kind: outcome.kind, uid: outcome.kind === 'fish' ? outcome.fish.uid : outcome.item.uid };
    if (outcome.kind === 'item') {
      next.items = [...state.items, { ...outcome.item, caughtAtMs: now, originRegionId: state.currentRegion,
        repairAttempted: false, repairOutcome: null, salePrice: null, repairedAtMs: null, repairCommandId: null }];
    } else {
      const fish = outcome.fish;
      next.bucket = [...state.bucket, { ...fish, caughtAtMs: now, originRegionId: state.currentRegion }];
      const previous = state.codex[fish.speciesId];
      next.codex = { ...state.codex, [fish.speciesId]: {
        maxLength: Math.max(previous?.maxLength || 0, fish.length), maxWeight: Math.max(previous?.maxWeight || 0, fish.weight),
        bestQuality: rank(previous?.bestQuality) > rank(fish.quality) ? previous.bestQuality : fish.quality,
        firstCaughtAtMs: previous?.firstCaughtAtMs ?? now, catchCount: increment(previous?.catchCount || 0, '图鉴次数'),
      } };
      if (!active) {
        next.pityCounter = ['epic', 'legendary'].includes(fish.quality) ? 0 : increment(state.pityCounter, '保底次数');
        if (state.fishing.useBait) {
          if (state.baitLeft > 0) next.baitLeft -= 1;
          else if (state.baitCount > 0) { next.baitCount -= 1; next.baitLeft = BAIT_CATCHES - 1; }
        }
      }
    }
  }
  next.fishing = { ...state.fishing, lastResult: result, phase: active ? 'ready' : 'waiting', attempt: null };
  return active ? next : waitAgain(next, now);
}

function focusTick(state, elapsed) {
  const focus = state.focus;
  if (!focus.plan) {
    if (!focus.breakRemainingMs || !elapsed) return state;
    return { ...state, focus: { ...focus, breakRemainingMs: Math.max(0, focus.breakRemainingMs - elapsed) } };
  }
  if (focus.plan.status !== 'running' || !elapsed) return state;
  const elapsedMs = focus.plan.elapsedMs + elapsed;
  if (elapsedMs < FOCUS_CONFIG.durationMs) return { ...state, focus: { ...focus, plan: { ...focus.plan, elapsedMs } } };
  if (focus.completedPlanIds.includes(focus.plan.id)) throw new Error('计划已完成');
  const day = focus.days[focus.plan.dayKey] || { completedCount: 0, ticketGranted: false };
  const completedCount = increment(day.completedCount, '当日计划数');
  const awardTicket = !day.ticketGranted && completedCount >= FOCUS_CONFIG.dailyPlans;
  return { ...state, baitCount: state.baitCount + FOCUS_CONFIG.baitReward,
    freeTravelTickets: state.freeTravelTickets + Number(awardTicket), focus: { ...focus,
      plan: null, completedPlanIds: [...focus.completedPlanIds, focus.plan.id],
      days: { ...focus.days, [focus.plan.dayKey]: { completedCount, ticketGranted: day.ticketGranted || awardTicket } },
      breakRemainingMs: FOCUS_CONFIG.breakMs } };
}

function activeTick(state, elapsed, now) {
  if (state.fishing.phase !== 'gauge' || !state.fishing.attempt?.gaugeRunning || !elapsed) return state;
  const total = state.fishing.attempt.gaugeElapsedMs + elapsed;
  if (total >= A.gaugeTimeoutMs) return finishAttempt(state, now, false, true);
  return { ...state, fishing: { ...state.fishing, attempt: { ...state.fishing.attempt, gaugeElapsedMs: total } } };
}

export function quoteTicketPayment(state, route, payment = 'coins') {
  if (!['coins', 'free'].includes(payment)) throw new Error('无效支付方式');
  const free = payment === 'free';
  if (free && state.freeTravelTickets < 1) throw new Error('还没有免费通票，完成今日4个番茄计划可获得');
  return { baseFare: route.price, farePaid: free ? 0 : state.discounts.ticket ? Math.round(route.price * .9) : route.price,
    payment, discountSourceItemUid: !free ? state.discounts.ticket?.sourceItemUid || null : null };
}

// undefined means this is an existing non-edition command handled by gameState.
export function applyEditionCommand(state, command, now) {
  switch (command.type) {
    case 'START_FISHING':
      onGround(state);
      if (state.fishing.phase === 'gauge') throw new Error('请先完成或取消当前收鱼条');
      if (state.fishing.mode === 'ordinary') return state;
      return waitAgain({ ...stopFishing(state), fishing: { ...stopFishing(state).fishing,
        useBait: command.useBait === undefined ? state.fishing.useBait : Boolean(command.useBait) } }, now);
    case 'STOP_FISHING':
      if (state.fishing.mode === 'stopped') return state;
      return stopFishing(state, true);
    case 'SET_FISHING_BAIT':
      if (typeof command.enabled !== 'boolean') throw new Error('鱼饵设置无效');
      return { ...state, fishing: { ...state.fishing, useBait: command.enabled } };
    case 'OPEN_BITE': {
      onGround(state);
      if (state.fishing.mode !== 'ordinary' || state.fishing.phase !== 'waiting') return state;
      if (now < state.fishing.attempt.waitUntilMs) return state;
      return { ...state, fishing: { ...state.fishing, phase: 'bite', attempt: { ...state.fishing.attempt,
        biteAtMs: now, deadlineMs: now + A.biteWindowMs } } };
    }
    case 'RESOLVE_BITE': {
      onGround(state);
      const attempt = state.fishing.attempt;
      if (state.fishing.mode !== 'ordinary' || state.fishing.phase !== 'bite' || command.attemptId !== attempt?.id) throw new Error('这次鱼讯已处理或无效');
      if (typeof command.manual !== 'boolean') throw new Error('收鱼方式无效');
      const inputAt = command.inputAtMs ?? now;
      if (command.manual && (!Number.isFinite(inputAt) || inputAt < attempt.biteAtMs || inputAt >= attempt.deadlineMs || inputAt > now)) throw new Error('鱼讯已截止，等待自动结算');
      if (!command.manual && now < attempt.deadlineMs) throw new Error('尚未到自动收鱼时间');
      const success = command.manual || assetRandom(attempt.seed, 'automatic-success')() < A.automaticSuccess;
      return finishAttempt(state, now, success, false);
    }
    case 'BUY_ACTIVE_PASS': {
      onGround(state);
      if (state.activePass.purchaseIds.includes(command.id)) return state;
      if (state.activePass.remaining > 0 || state.fishing.attempt?.kind === 'active') throw new Error('请先用完当前主动竿及未结机会');
      const quote = quoteActivePass(state);
      if (state.coins < quote.price) throw new Error(`金币不足，需要${quote.price}金币`);
      return { ...state, coins: state.coins - quote.price,
        activePass: { remaining: A.charges, bundleId: command.id, purchasedAtMs: now, purchaseIds: [...state.activePass.purchaseIds, command.id] },
        discounts: { ...state.discounts, activeRod: null } };
    }
    case 'START_ACTIVE': {
      onGround(state);
      if (state.fishing.phase === 'gauge') return state;
      if (state.activePass.remaining < 1) throw new Error('请先购买15次主动竿');
      const retained = state.fishing.attempt?.kind === 'active' && state.fishing.phase === 'casting' ? state.fishing.attempt : null;
      return { ...state, fishing: { ...state.fishing, mode: 'active', phase: retained ? 'casting' : 'ready',
        attempt: retained ? { ...retained, nextSwingAtMs: now + A.swingMs } : null } };
    }
    case 'CAST_ACTIVE': {
      onGround(state);
      if (state.fishing.mode !== 'active' || state.fishing.phase !== 'ready' || state.activePass.remaining < 1) throw new Error('主动竿尚未准备好');
      const attempt = makeAttempt(state, 'active', now);
      return { ...state, fishing: { ...state.fishing, phase: 'casting', attemptSequence: attempt.sequence, attempt } };
    }
    case 'ADVANCE_ACTIVE': {
      onGround(state);
      const attempt = state.fishing.attempt;
      if (state.fishing.mode !== 'active' || state.fishing.phase !== 'casting') return state;
      if (now < attempt.nextSwingAtMs) return state;
      const completedSwings = attempt.completedSwings + 1;
      if (completedSwings < attempt.targetSwings) return { ...state, fishing: { ...state.fishing,
        attempt: { ...attempt, completedSwings, nextSwingAtMs: now + A.swingMs } } };
      if (state.activePass.remaining < 1) throw new Error('主动竿次数不足');
      return { ...state, activePass: { ...state.activePass, remaining: state.activePass.remaining - 1 },
        fishing: { ...state.fishing, phase: 'gauge', attempt: { ...attempt, completedSwings,
          nextSwingAtMs: now, gaugeElapsedMs: 0, gaugeRunning: true } } };
    }
    case 'TICK_ACTIVE': return activeTick(state, duration(command), now);
    case 'STOP_ACTIVE_BAR': {
      onGround(state);
      if (state.fishing.phase !== 'gauge' || !state.fishing.attempt?.gaugeRunning) throw new Error('当前收鱼条没有运行');
      const progressed = activeTick(state, duration(command), now);
      if (progressed.fishing.phase !== 'gauge') return progressed;
      const attempt = progressed.fishing.attempt;
      const band = gaugeBand(gaugePosition(attempt.gaugeElapsedMs));
      return finishAttempt(progressed, now, assetRandom(attempt.seed, 'active-success')() < band.success, true);
    }
    case 'PAUSE_ACTIVE_BAR': {
      const progressed = activeTick(state, duration(command), now);
      if (progressed.fishing.phase !== 'gauge' || !progressed.fishing.attempt.gaugeRunning) return progressed;
      return { ...progressed, fishing: { ...progressed.fishing,
        attempt: { ...progressed.fishing.attempt, gaugeRunning: false } } };
    }
    case 'RESUME_ACTIVE_BAR':
      onGround(state);
      if (state.fishing.phase !== 'gauge' || !state.fishing.attempt || state.fishing.attempt.gaugeRunning) return state;
      return { ...state, fishing: { ...state.fishing, attempt: { ...state.fishing.attempt, gaugeRunning: true } } };
    case 'CANCEL_ACTIVE_BAR':
      if (state.fishing.phase !== 'gauge') return state;
      return finishAttempt(state, now, false, true);
    case 'START_FOCUS': {
      if (state.focus.plan) throw new Error('先完成或取消当前计划，同一时间只能专注一个');
      const title = typeof command.title === 'string' ? command.title.trim() : '';
      if (!title || title.length > 100) throw new Error('请输入1–100字的计划名称');
      const sequence = increment(state.focus.sequence, '计划序号');
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
      const dayKey = `${date.year}-${date.month}-${date.day}`;
      return { ...state, focus: { ...state.focus, sequence, breakRemainingMs: 0,
        plan: { id: `focus:${state.randomSeed}:${sequence}`, title, status: 'running', elapsedMs: 0,
          durationMs: FOCUS_CONFIG.durationMs, dayKey, timeZone } } };
    }
    case 'FOCUS_TICK': return focusTick(state, duration(command), now);
    case 'PAUSE_FOCUS': {
      const progressed = focusTick(state, duration(command), now);
      if (!progressed.focus.plan || progressed.focus.plan.status !== 'running') return progressed;
      return { ...progressed, focus: { ...progressed.focus, plan: { ...progressed.focus.plan, status: 'paused' } } };
    }
    case 'RESUME_FOCUS':
      if (!state.focus.plan || state.focus.plan.status !== 'paused') return state;
      return { ...state, focus: { ...state.focus, plan: { ...state.focus.plan, status: 'running' } } };
    case 'CANCEL_FOCUS':
      if (!state.focus.plan && !state.focus.breakRemainingMs) return state;
      return { ...state, focus: { ...state.focus, plan: null, breakRemainingMs: 0 } };
    case 'RECOVER_RUNTIME': {
      let next = state;
      if (state.fishing.mode === 'ordinary' || (state.fishing.mode === 'active' && state.fishing.phase !== 'gauge')) next = stopFishing(next, true);
      if (next.fishing.phase === 'gauge' && next.fishing.attempt.gaugeRunning) next = { ...next,
        fishing: { ...next.fishing, attempt: { ...next.fishing.attempt, gaugeRunning: false } } };
      if (next.focus.plan?.status === 'running') next = { ...next,
        focus: { ...next.focus, plan: { ...next.focus.plan, status: 'paused' } } };
      return next;
    }
    default: return undefined;
  }
}
