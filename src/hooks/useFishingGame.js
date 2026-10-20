import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GameSession } from '../application/gameSession.js';
import { createRepository } from '../storage/repository.js';
import { RODS, BITE, JUDGE, BAIT_QUALITY_BONUS } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { rollFish, randInt, qualityById } from '../lib/gameUtils.js';
import { pickLine } from '../lib/speech.js';

const devNumber = (name) => {
  if (!import.meta.env.DEV) return null;
  const raw = new URLSearchParams(window.location.search).get(name);
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export function useFishingGame() {
  const [repository] = useState(createRepository);
  const [session] = useState(() => new GameSession(repository));
  const [state, setState] = useState(null);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [nowMs, setNowMs] = useState(() => session.now());
  const [status, setStatus] = useState('idle');
  const [windowLeft, setWindowLeft] = useState(0);
  const [waitLeft, setWaitLeft] = useState(0);
  const [speech, setSpeech] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const fishing = useRef({ status: 'idle', due: 0, idleSeconds: 0, chatterDue: 0 });
  const speechTimer = useRef(null);
  const pokeTimes = useRef([]);
  const bootStarted = useRef(false);
  const arrivalPending = useRef(false);
  const arrivalRetryAt = useRef(0);

  useEffect(() => session.subscribe(setState), [session]);
  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    session.load().then((result) => {
      if (result.recovery?.recovered) toast.info(result.recovery.message || '已从备用存档恢复');
    }).catch((e) => setError(e.message)).finally(() => setBooted(true));
  }, [session]);

  const say = useCallback((pool, tone = pool) => {
    if (speechTimer.current) clearTimeout(speechTimer.current);
    setSpeech({ text: pickLine(pool), tone, id: Date.now() });
    speechTimer.current = setTimeout(() => setSpeech(null), FISHING_CONFIG.speechMs);
  }, []);
  useEffect(() => () => clearTimeout(speechTimer.current), []);

  const nextWait = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const f = fishing.current;
    const rod = RODS[current.rodLevel];
    const seconds = devNumber('bite') || Math.max(FISHING_CONFIG.waitFloorSeconds,
      Math.round(randInt(BITE.minSeconds, BITE.maxSeconds) * rod.intervalMult *
        (1 - Math.min(FISHING_CONFIG.idleBoostMax, f.idleSeconds / 3600 * FISHING_CONFIG.idleBoostPerHour))));
    f.status = 'idle';
    f.due = session.now() + seconds * 1000;
    f.chatterDue = session.now() + randInt(FISHING_CONFIG.speechMinSeconds, FISHING_CONFIG.speechMaxSeconds) * 1000;
    setStatus('idle'); setWindowLeft(0); setWaitLeft(seconds);
  }, [session]);

  useEffect(() => { nextWait(); }, [state?.currentRegion, state?.travel?.id, nextWait]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = session.now(); setNowMs(now);
      const current = stateRef.current;
      if (!current || current.travel) return;
      const f = fishing.current;
      if (f.status === 'saving') return;
      if (!f.due) { nextWait(); return; }
      if (f.status === 'idle') {
        f.idleSeconds += 1;
        if (now >= f.due) {
          f.status = 'bite'; f.due = now + (JUDGE.windowSeconds + RODS[current.rodLevel].windowBonus) * 1000;
          setStatus('bite'); setWaitLeft(0);
          setWindowLeft(Math.ceil((f.due - now) / 1000));
        } else {
          setWaitLeft(Math.ceil((f.due - now) / 1000));
          if (now >= f.chatterDue) { say('idle'); f.chatterDue = now + randInt(FISHING_CONFIG.speechMinSeconds, FISHING_CONFIG.speechMaxSeconds) * 1000; }
        }
      } else if (now >= f.due) { say('miss'); nextWait(); }
      else setWindowLeft(Math.ceil((f.due - now) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [session, nextWait, say]);

  const run = useCallback(async (type, fields = {}, message) => {
    setPending((n) => n + 1);
    try {
      const result = await session.dispatch({ type, id: crypto.randomUUID(), ...fields });
      if (message) toast.success(typeof message === 'function' ? message(result) : message);
      return result;
    } catch (e) { toast.error(e.message); if (session.blocked) setError(e.message); return null; }
    finally { setPending((n) => n - 1); }
  }, [session]);

  useEffect(() => {
    if (error || session.blocked || arrivalPending.current || nowMs < arrivalRetryAt.current || !state?.travel || nowMs < state.travel.arriveAtMs) return;
    arrivalPending.current = true;
    void run('ARRIVE', {}, '已抵达，水塘在等你').then((result) => {
      if (!result) arrivalRetryAt.current = session.now() + 30000;
    }).finally(() => { arrivalPending.current = false; });
  }, [state?.travel, nowMs, run, error, session]);

  const initialize = useCallback(async (regionId) => {
    setPending((n) => n + 1);
    try {
      const snapshot = await session.initialize(regionId);
      if (import.meta.env.DEV && devNumber('coins') != null && snapshot.revision === 0) {
        await session.commit({ ...snapshot, coins: devNumber('coins'), revision: 1 }, null);
      }
    } catch (e) { setError(e.message); }
    finally { setPending((n) => n - 1); }
  }, [session]);

  const catchFish = useCallback(async () => {
    const f = fishing.current, current = stateRef.current;
    if (!current || current.travel || f.status !== 'bite' || session.now() >= f.due) return;
    f.status = 'saving'; setStatus('idle');
    const rod = RODS[current.rodLevel];
    const usedBait = current.baitLeft > 0 || current.baitCount > 0;
    const elapsed = JUDGE.windowSeconds + rod.windowBonus - Math.ceil((f.due - session.now()) / 1000);
    const best = elapsed >= JUDGE.bestClickStart && elapsed <= JUDGE.bestClickEnd ? JUDGE.qualityBonusBest : 0;
    const fish = rollFish(current.currentRegion, { qualityBonus: rod.qualityBonus + (usedBait ? BAIT_QUALITY_BONUS : 0) + best, pity: current.pityCounter });
    const result = await run('CATCH', { fish });
    if (result) {
      const high = ['epic', 'legendary'].includes(fish.quality);
      say(high ? 'high' : fish.quality === 'rare' ? 'rare' : 'success', high ? 'high' : 'success');
      toast.success(`钓到「${qualityById(fish.quality).name}·${fish.name}」 ${fish.length}cm / ${fish.weight}kg`);
    }
    nextWait();
  }, [run, say, session, nextWait]);

  const pokeBobber = useCallback(() => {
    if (stateRef.current?.travel || fishing.current.status !== 'idle') return;
    const now = session.now();
    pokeTimes.current = [...pokeTimes.current.filter((t) => now - t <= FISHING_CONFIG.pokeWindowMs), now];
    if (pokeTimes.current.length >= FISHING_CONFIG.pokeCount) { pokeTimes.current = []; say('airForce', 'miss'); }
    else say('impatient', 'idle');
  }, [say, session]);

  const importSave = useCallback(async () => {
    if (!repository.importSave) return toast.info('请使用 Windows 安装版导入存档');
    setPending((n) => n + 1);
    try {
      await session.enqueue(async () => {
        const result = await repository.importSave();
        if (!result?.canceled) { await session.load(); setError(''); session.blocked = false; toast.success('存档已导入'); nextWait(); }
      });
    } catch (e) { toast.error(e.message); }
    finally { setPending((n) => n - 1); }
  }, [repository, session, nextWait]);
  const exportSave = useCallback(async () => {
    try { if (session.snapshot) await repository.exportSave(session.snapshot); }
    catch (e) { toast.error(e.message); }
  }, [repository, session]);
  const visitGeo = useCallback((regionId) => run('GEO_VISIT', { regionId }), [run]);

  return { ...(state || {}), state, ready: !!state, booted, error, busy: pending > 0, nowMs, initialize,
    status, windowLeft, waitLeft, speech, catchFish, pokeBobber, importSave, exportSave, visitGeo,
    visitRealRegion: () => run('REAL_VISIT', {}, '已来到现实所在地的水域'),
    sellOne: (uid) => run('SELL_ONE', { uid }, '鱼已卖出，图鉴记录已保留'),
    sellAll: () => run('SELL_ALL', {}, '鱼篓已卖出，金币已保存'),
    buyBait: () => run('BUY_BAIT', {}, '高级鱼饵已放入背包'),
    buyRod: () => run('BUY_ROD', {}, '鱼竿已升级'),
    travelTo: (toId) => run('START_TRAVEL', { toId }, '机票已购买，正在飞往目的地'),
    updateSettings: (patch) => run('SETTINGS', { patch }),
  };
}
