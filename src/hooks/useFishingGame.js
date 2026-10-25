import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GameSession } from '../application/gameSession.js';
import { applyCommand } from '../domain/gameState.js';
import { createRepository } from '../storage/repository.js';
import { RODS, BITE, JUDGE, FISH, REGIONS } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { randInt, qualityById } from '../lib/gameUtils.js';
import { DialogueDirector } from '../lib/dialogueDirector.js';
import { BiteAudio } from '../services/biteAudio.js';
import { itemName } from '../domain/loot.js';

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
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [director] = useState(() => new DialogueDirector());
  const audioRef = useRef(null);
  const lastVisibleAt = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const fishing = useRef({ status: 'idle', due: 0, idleSeconds: 0, chatterDue: 0 });
  const speechTimer = useRef(null);
  const bootStarted = useRef(false);
  const arrivalPending = useRef(false);
  const arrivalRetryAt = useRef(0);

  useEffect(() => session.subscribe(setState), [session]);
  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    session.load().then(async (result) => {
      if (result.recovery?.recovered) toast.info(result.recovery.message || '已从备用存档恢复');
      const loaded = session.snapshot;
      if (loaded?.arrivalEvent && loaded.arrivalEvent.sequence > loaded.arrivalConsumedSequence) {
        await session.dispatch({ type: 'CONSUME_ARRIVAL', id: crypto.randomUUID(), sequence: loaded.arrivalEvent.sequence });
      }
    }).catch((e) => setError(e.message)).finally(() => setBooted(true));
  }, [session]);

  const showSpeech = useCallback((line) => {
    if (!line) return;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    setSpeech(line);
    speechTimer.current = setTimeout(() => setSpeech(null), FISHING_CONFIG.speechMs);
  }, []);
  const say = useCallback((pool, tone = pool) => {
    showSpeech(director.speak(pool, session.now(), { tone }));
  }, [director, session, showSpeech]);
  useEffect(() => () => clearTimeout(speechTimer.current), []);

  useEffect(() => {
    const player = new BiteAudio({ onBlocked: () => {
      setAudioBlocked(true);
      toast.info('鱼讯声音暂未获系统允许，可点击开启', {
        id: 'bite-audio-blocked',
        action: { label: '开启声音', onClick: () => void player.unlock().then((ok) => setAudioBlocked(!ok)) },
      });
    } });
    audioRef.current = player;
    let unlocked = false;
    const gesture = () => {
      if (unlocked) return;
      void player.unlock().then((ok) => { if (ok) { unlocked = true; setAudioBlocked(false); } });
    };
    document.addEventListener('pointerdown', gesture);
    document.addEventListener('keydown', gesture);
    return () => {
      document.removeEventListener('pointerdown', gesture); document.removeEventListener('keydown', gesture);
      player.dispose(); audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (state?.settings?.biteSoundEnabled === false || state?.settings?.biteSoundVolume === 0) audioRef.current?.invalidate();
    const visibility = () => {
      if (document.hidden && stateRef.current?.settings?.backgroundBiteSound === false) audioRef.current?.invalidate();
      if (!document.hidden) lastVisibleAt.current = session.now();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [state?.settings?.biteSoundEnabled, state?.settings?.biteSoundVolume, session]);

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

  useEffect(() => {
    director.reset(); audioRef.current?.invalidate(); nextWait();
    if (stateRef.current?.travel) { clearTimeout(speechTimer.current); setSpeech(null); }
  }, [state?.currentRegion, state?.travel?.id, nextWait, director]);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = session.now(); setNowMs(now);
      const current = stateRef.current;
      if (!current || current.travel || session.blocked) return;
      const f = fishing.current;
      if (f.status === 'saving') return;
      if (!f.due) { nextWait(); return; }
      if (f.status === 'idle') {
        f.idleSeconds += 1;
        if (now >= f.due) {
          const biteAt = f.due;
          const expiresAt = biteAt + (JUDGE.windowSeconds + RODS[current.rodLevel].windowBonus) * 1000;
          if (now >= expiresAt) { nextWait(); return; }
          f.status = 'bite'; f.due = expiresAt;
          f.biteId = crypto.randomUUID();
          // If the timer was suspended, restoring the window never announces a
          // bite whose onset belongs to the previous background interval.
          if (biteAt >= lastVisibleAt.current) void audioRef.current?.bite({ id: f.biteId, expiresAtMs: f.due }, current.settings);
          setStatus('bite'); setWaitLeft(0);
          setWindowLeft(Math.ceil((f.due - now) / 1000));
        } else {
          setWaitLeft(Math.ceil((f.due - now) / 1000));
          if (now >= f.chatterDue) { if (!document.hidden) say('idle'); f.chatterDue = now + randInt(FISHING_CONFIG.speechMinSeconds, FISHING_CONFIG.speechMaxSeconds) * 1000; }
        }
      } else if (now >= f.due) { say('miss'); nextWait(); }
      else setWindowLeft(Math.ceil((f.due - now) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [session, nextWait, say]);

  const run = useCallback(async (type, fields = {}, message, messageId) => {
    setPending((n) => n + 1);
    try {
      const beforeRegion = session.snapshot?.currentRegion;
      const result = await session.dispatch({ type, id: crypto.randomUUID(), ...fields });
      if (['ARRIVE', 'REAL_VISIT'].includes(type) && result.currentRegion !== beforeRegion && result.arrivalEvent
        && result.arrivalEvent.sequence > result.arrivalConsumedSequence) {
        const event = result.arrivalEvent;
        const claimId = crypto.randomUUID();
        const claimed = await session.dispatch({ type: 'CONSUME_ARRIVAL', id: claimId, sequence: event.sequence });
        // A queued second visit can see the same unconsumed event before the
        // first claim commits. Only the command that actually advanced the
        // durable watermark owns this bubble; a successful no-op owns nothing.
        if (claimed.lastCommittedCommandId === claimId && claimed.arrivalConsumedSequence === event.sequence) {
          const fishIds = REGIONS.find((region) => region.id === event.regionId)?.fish.map(([id]) => id) || [];
          showSpeech(director.arrival(event.regionId, session.now(), FISH.filter((fish) => fishIds.includes(fish.id)).map((fish) => fish.name)));
        }
      }
      if (message) toast.success(typeof message === 'function' ? message(result) : message,
        messageId ? { id: messageId, duration: 1800 } : undefined);
      return result;
    } catch (e) { toast.error(e.message); if (session.blocked) setError(e.message); return null; }
    finally { setPending((n) => n - 1); }
  }, [session, director, showSpeech]);

  useEffect(() => {
    if (!booted || error || session.blocked || arrivalPending.current || nowMs < arrivalRetryAt.current || !state?.travel || nowMs < state.travel.arriveAtMs) return;
    arrivalPending.current = true;
    void run('ARRIVE', {}, '已抵达，水塘在等你').then((result) => {
      if (!result) arrivalRetryAt.current = session.now() + 30000;
    }).finally(() => { arrivalPending.current = false; });
  }, [state?.travel, nowMs, run, error, session, booted]);

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
    const elapsed = JUDGE.windowSeconds + rod.windowBonus - Math.ceil((f.due - session.now()) / 1000);
    const bestClick = elapsed >= JUDGE.bestClickStart && elapsed <= JUDGE.bestClickEnd;
    const result = await run('CATCH', { expectedCatchSequence: current.catchSequence + 1, bestClick });
    if (result) {
      const fish = result.bucket.find((entry) => entry.catchSequence === result.catchSequence);
      if (fish) {
        const high = ['epic', 'legendary'].includes(fish.quality);
        say(high ? 'high' : fish.quality === 'rare' ? 'rare' : 'success', high ? 'high' : 'success');
        toast.success(`钓到「${qualityById(fish.quality).name}·${fish.name}」 ${fish.length}cm / ${fish.weight}kg`);
      } else {
        say('item', 'success');
        const item = result.items.find((entry) => entry.catchSequence === result.catchSequence);
        toast.success(`钓到「${itemName(item)}」 · 在鱼篓的物品栏查看`);
      }
    }
    nextWait();
  }, [run, say, session, nextWait]);

  const pokeBobber = useCallback(() => {
    if (stateRef.current?.travel || fishing.current.status !== 'idle') return;
    showSpeech(director.poke(session.now()));
  }, [showSpeech, director, session]);

  const importSave = useCallback(async () => {
    if (!repository.importSave) return toast.info('请使用 Windows 安装版导入存档');
    setPending((n) => n + 1);
    try {
      await session.enqueue(async () => {
        const result = await repository.importSave();
        if (!result?.canceled) {
          await session.load(); director.reset(); audioRef.current?.invalidate(); clearTimeout(speechTimer.current); setSpeech(null);
          const loaded = session.snapshot;
          if (loaded?.arrivalEvent && loaded.arrivalEvent.sequence > loaded.arrivalConsumedSequence) {
            const command = { type: 'CONSUME_ARRIVAL', id: crypto.randomUUID(), sequence: loaded.arrivalEvent.sequence };
            // Already inside the session queue: apply/commit directly to avoid a nested enqueue deadlock.
            await session.commit(applyCommand(loaded, command, session.now()), command.id);
          }
          setError(''); session.blocked = false; toast.success('存档已导入'); nextWait();
        }
      });
    } catch (e) { toast.error(e.message); }
    finally { setPending((n) => n - 1); }
  }, [repository, session, nextWait, director]);
  const exportSave = useCallback(async () => {
    try { if (session.snapshot) await repository.exportSave(session.snapshot); }
    catch (e) { toast.error(e.message); }
  }, [repository, session]);
  const visitGeo = useCallback((regionId) => run('GEO_VISIT', { regionId }), [run]);

  return { ...(state || {}), state, ready: !!state, booted, error, busy: pending > 0, nowMs, initialize,
    status, windowLeft, waitLeft, speech, catchFish, pokeBobber, importSave, exportSave, visitGeo, audioBlocked,
    enableAudio: async () => { const ok = await audioRef.current?.unlock(); setAudioBlocked(!ok); return ok; },
    sellItem: (uid) => run('SELL_ITEM', { uid }, '物品已出售'),
    repairItem: (uid) => run('REPAIR_ITEM', { uid }, '修理完成，结果已保存'),
    useItem: (uid) => run('USE_ITEM', { uid }, '秘籍已使用，之后钓获的新鲜鱼前3次出售加价50%'),
    visitRealRegion: () => run('REAL_VISIT', {}, '已来到现实所在地的水域'),
    sellOne: (uid) => run('SELL_ONE', { uid }, '鱼已卖出，图鉴记录已保留'),
    sellAll: () => run('SELL_ALL', {}, '鱼篓已卖出，金币已保存'),
    buyBait: () => run('BUY_BAIT', {}, '高级鱼饵已放入背包'),
    buyRod: () => run('BUY_ROD', {}, '鱼竿已升级'),
    buyAppearance: (productId) => run('BUY_APPEARANCE', { productId }, '已收藏，外观权益已保存', 'appearance-purchase'),
    equipAppearance: (slot, styleId) => run('EQUIP_APPEARANCE', { slot, styleId }),
    travelTo: (toId) => run('START_TRAVEL', { toId }, '机票已购买，正在飞往目的地'),
    updateSettings: (patch) => run('SETTINGS', { patch }),
  };
}
