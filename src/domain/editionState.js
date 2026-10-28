import { EDITION_ID } from '../config/storage.js';
import { FOCUS_CONFIG } from '../config/focus.js';
import { ACTIVE_FISHING_CONFIG } from '../config/activeFishing.js';

export function createEditionFields() {
  return {
    editionId: EDITION_ID, legacy: null,
    fishing: { mode: 'stopped', phase: 'stopped', attemptSequence: 0, attempt: null, useBait: false, lastResult: null },
    activePass: { remaining: 0, bundleId: null, purchasedAtMs: null, purchaseIds: [] },
    focus: { sequence: 0, plan: null, completedPlanIds: [], days: {}, breakRemainingMs: 0 },
    freeTravelTickets: 0, discounts: { ticket: null, activeRod: null }, travelReceiptIds: [],
  };
}

export function validateEditionFields(s, { now, regionIds, currentRegion, itemIds }) {
  const fail = name => { throw new Error(`存档无效：${name}`); };
  const obj = (v, n) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(n); return v; };
  const integer = (v, n, max = Number.MAX_SAFE_INTEGER) => { if (!Number.isSafeInteger(v) || v < 0 || v > max) fail(n); return v; };
  const text = (v, n) => { if (typeof v !== 'string' || !v || v.length > 200) fail(n); return v; };
  const time = (v, n) => { if (!Number.isFinite(v) || v < 0 || v > Number.MAX_SAFE_INTEGER) fail(n); return v; };
  const bool = (v, n) => { if (typeof v !== 'boolean') fail(n); return v; };
  if (s.editionId !== EDITION_ID) fail('不是第一版专注档案，请使用对应版本应用');
  let legacy = null;
  if (s.legacy != null) {
    const l = obj(s.legacy, '旧档记录');
    if (![1, 2, 3].includes(l.sourceSchemaVersion)) fail('旧档来源版本');
    const rodLevel = integer(l.rodLevel, '旧竿等级', 3);
    if (l.rodCompensation !== [0, 600, 3200, 12200][rodLevel]) fail('旧竿补偿关系');
    legacy = { sourceSchemaVersion: l.sourceSchemaVersion, rodLevel, rodCompensation: l.rodCompensation,
      migrationId: text(l.migrationId, '迁移凭据'), whitecapeGift: bool(l.whitecapeGift, '人物赠礼记录') };
  }
  const rawPass = obj(s.activePass, '主动竿次数');
  const activePass = { remaining: integer(rawPass.remaining, '主动竿余次', ACTIVE_FISHING_CONFIG.charges),
    bundleId: rawPass.bundleId == null ? null : text(rawPass.bundleId, '主动竿购买凭据'),
    purchasedAtMs: rawPass.purchasedAtMs == null ? null : time(rawPass.purchasedAtMs, '主动竿购买时间'), purchaseIds: rawPass.purchaseIds };
  if (!Array.isArray(activePass.purchaseIds) || activePass.purchaseIds.length > 100000
    || new Set(activePass.purchaseIds).size !== activePass.purchaseIds.length) fail('主动竿购买账本');
  activePass.purchaseIds.forEach(id => text(id, '主动竿永久购买凭据'));
  activePass.purchaseIds = [...activePass.purchaseIds];
  if (activePass.bundleId && !activePass.purchaseIds.includes(activePass.bundleId)) fail('主动竿来源账本');
  if ((activePass.bundleId == null) !== (activePass.purchasedAtMs == null)
    || (activePass.remaining > 0 && !activePass.bundleId) || activePass.purchasedAtMs > now) fail('主动竿购买关系');
  const f = obj(s.fishing, '钓鱼状态');
  if (!['stopped', 'ordinary', 'active'].includes(f.mode) || !['stopped', 'waiting', 'bite', 'ready', 'casting', 'gauge'].includes(f.phase)) fail('钓鱼阶段');
  const attemptSequence = integer(f.attemptSequence, '尝试序号');
  let attempt = null;
  if (f.attempt != null) {
    const a = obj(f.attempt, '钓鱼尝试');
    if (!['ordinary', 'active'].includes(a.kind) || !regionIds.has(a.regionId) || a.regionId !== currentRegion) fail('尝试地区或种类');
    if (integer(a.sequence, '尝试序号') !== attemptSequence || attemptSequence < 1) fail('尝试序号关系');
    attempt = { id: text(a.id, '尝试凭据'), kind: a.kind, regionId: a.regionId,
      sequence: a.sequence, seed: integer(a.seed, '尝试种子', 0xffffffff) };
    if (a.kind === 'ordinary') {
      attempt.waitUntilMs = time(a.waitUntilMs, '候鱼时间');
      attempt.biteAtMs = a.biteAtMs == null ? null : time(a.biteAtMs, '鱼讯时间');
      attempt.deadlineMs = a.deadlineMs == null ? null : time(a.deadlineMs, '鱼讯截止');
      if (f.mode !== 'ordinary' || !['waiting', 'bite'].includes(f.phase)) fail('普通钓鱼阶段关系');
      if (f.phase === 'waiting' && (attempt.biteAtMs != null || attempt.deadlineMs != null)) fail('未出现的鱼讯');
      if (f.phase === 'bite' && (attempt.biteAtMs == null || attempt.deadlineMs !== attempt.biteAtMs + ACTIVE_FISHING_CONFIG.biteWindowMs
        || attempt.biteAtMs < attempt.waitUntilMs || attempt.biteAtMs > now)) fail('鱼讯时间关系');
    } else {
      attempt.targetSwings = integer(a.targetSwings, '挥杆目标', 3);
      attempt.completedSwings = integer(a.completedSwings, '已挥杆次数', 3);
      attempt.nextSwingAtMs = time(a.nextSwingAtMs, '下次挥杆');
      if (![2, 3].includes(attempt.targetSwings) || attempt.completedSwings > attempt.targetSwings) fail('挥杆关系');
      if (!['casting', 'gauge'].includes(f.phase) || !['active', 'stopped'].includes(f.mode)) fail('主动钓鱼阶段关系');
      if (f.phase === 'gauge') {
        attempt.gaugeElapsedMs = integer(a.gaugeElapsedMs, '收鱼条进度', ACTIVE_FISHING_CONFIG.gaugeTimeoutMs - 1);
        attempt.gaugeRunning = bool(a.gaugeRunning, '收鱼条运行');
        if (f.mode !== 'active' || attempt.completedSwings !== attempt.targetSwings) fail('收鱼条阶段关系');
      } else if (attempt.completedSwings >= attempt.targetSwings) fail('未进入收鱼条');
    }
  }
  if (!attempt && ['waiting', 'bite', 'casting', 'gauge'].includes(f.phase)) fail('缺少钓鱼事件');
  if (!attempt && ((f.mode === 'stopped' && f.phase !== 'stopped') || (f.mode === 'active' && f.phase !== 'ready') || f.mode === 'ordinary')) fail('空钓鱼状态');
  let lastResult = null;
  if (f.lastResult != null) {
    const r = obj(f.lastResult, '收鱼结果');
    if (!['ordinary', 'active'].includes(r.mode) || !['fish', 'item', 'miss'].includes(r.kind) || typeof r.success !== 'boolean'
      || (r.success === (r.kind === 'miss'))) fail('收鱼结果关系');
    lastResult = { attemptId: text(r.attemptId, '收鱼事件凭据'), mode: r.mode, kind: r.kind,
      success: r.success, uid: r.uid == null ? null : text(r.uid, '收获凭据'), atMs: time(r.atMs, '收鱼时间') };
    if (lastResult.atMs > now || (lastResult.success && !lastResult.uid)) fail('收鱼结果时间');
  }
  const fishing = { mode: f.mode, phase: f.phase, attemptSequence, attempt,
    useBait: bool(f.useBait, '高级鱼饵使用设置'), lastResult };
  const rawFocus = obj(s.focus, '专注状态');
  const sequence = integer(rawFocus.sequence, '计划序号');
  const completedPlanIds = rawFocus.completedPlanIds;
  if (!Array.isArray(completedPlanIds) || completedPlanIds.length > 100000 || completedPlanIds.length > sequence
    || new Set(completedPlanIds).size !== completedPlanIds.length) fail('完成计划记录');
  completedPlanIds.forEach(id => text(id, '已完成计划凭据'));
  const days = {};
  let completedCount = 0, earnedTickets = 0;
  const dayEntries = Object.entries(obj(rawFocus.days, '每日计划记录'));
  if (dayEntries.length > 30000) fail('每日计划记录过多');
  for (const [key, value] of dayEntries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) fail('计划日期');
    const day = obj(value, '每日记录');
    const count = integer(day.completedCount, '每日完成次数');
    const ticketGranted = bool(day.ticketGranted, '每日通票凭据');
    if (ticketGranted !== (count >= FOCUS_CONFIG.dailyPlans)) fail('每日通票关系');
    days[key] = { completedCount: count, ticketGranted };
    completedCount += count; earnedTickets += Number(ticketGranted);
  }
  if (completedCount !== completedPlanIds.length) fail('计划完成汇总关系');
  let plan = null;
  if (rawFocus.plan != null) {
    const p = obj(rawFocus.plan, '专注计划');
    if (!['running', 'paused'].includes(p.status) || p.durationMs !== FOCUS_CONFIG.durationMs
      || !/^\d{4}-\d{2}-\d{2}$/.test(p.dayKey)) fail('计划内容');
    const elapsedMs = integer(p.elapsedMs, '已专注时间', FOCUS_CONFIG.durationMs - 1);
    const id = text(p.id, '计划凭据');
    if (completedPlanIds.includes(id) || sequence < 1) fail('计划已完成');
    const timeZone = text(p.timeZone, '计划时区');
    try { new Intl.DateTimeFormat('en-CA', { timeZone }).format(0); } catch { fail('未知计划时区'); }
    plan = { id, title: text(p.title, '计划名称'), status: p.status, elapsedMs,
      durationMs: p.durationMs, dayKey: p.dayKey, timeZone };
  }
  const focus = { sequence, plan, completedPlanIds: [...completedPlanIds], days,
    breakRemainingMs: integer(rawFocus.breakRemainingMs, '休息剩余', FOCUS_CONFIG.breakMs) };
  if (plan && focus.breakRemainingMs) fail('休息与专注同时运行');
  const freeTravelTickets = integer(s.freeTravelTickets, '免费通票');
  if (freeTravelTickets > earnedTickets) fail('免费通票来源');
  const discounts = {};
  const discountSources = new Set();
  for (const key of ['ticket', 'activeRod']) {
    const raw = obj(s.discounts, '优惠状态')[key];
    if (raw == null) { discounts[key] = null; continue; }
    const source = text(obj(raw, '优惠凭据').sourceItemUid, '优惠来源');
    if (itemIds.has(source) || discountSources.has(source)) fail('优惠来源重复');
    discountSources.add(source); discounts[key] = { sourceItemUid: source };
  }
  if (!Array.isArray(s.travelReceiptIds) || s.travelReceiptIds.length > 100000
    || new Set(s.travelReceiptIds).size !== s.travelReceiptIds.length) fail('旅行支付账本');
  s.travelReceiptIds.forEach(id => text(id, '旅行永久支付凭据'));
  return { editionId: EDITION_ID, legacy, fishing, activePass, focus, freeTravelTickets, discounts,
    travelReceiptIds: [...s.travelReceiptIds] };
}
