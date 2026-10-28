import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { GameSession } from '../application/gameSession.js';
import { applyCommand } from '../domain/gameState.js';
import { createRepository } from '../storage/repository.js';
import { FISH, REGIONS } from '../lib/gameConfig.js';
import { FISHING_CONFIG } from '../config/fishing.js';
import { ACTIVE_FISHING_CONFIG, gaugePosition } from '../config/activeFishing.js';
import { FOCUS_CONFIG } from '../config/focus.js';
import { qualityById, randInt } from '../lib/gameUtils.js';
import { DialogueDirector } from '../lib/dialogueDirector.js';
import { BiteAudio } from '../services/biteAudio.js';
import { itemName } from '../domain/loot.js';
import { FishingRuntimePump, fishingView, localDayKey, RUNTIME_INTERVAL_MS } from './fishingRuntime.js';

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
  const [speech, setSpeech] = useState(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [director] = useState(() => new DialogueDirector());
  const audioRef = useRef(null);
  const stateRef = useRef(null);
  const speechTimer = useRef(null);
  const bootStarted = useRef(false);
  const bootCompleted = useRef(false);
  const manualCatchPending = useRef(false);
  const arrivalPending = useRef(false);
  const arrivalRetryAt = useRef(0);
  const lastVisibleAt = useRef(0);
  const chatterDue = useRef(0);
  const lastResultId = useRef(null);
  const completionCount = useRef(0);
  const ticketCount = useRef(0);
  const runtimeSuspended = useRef(false);
  const lifecycleWork = useRef(Promise.resolve());
  const runtimePump = useRef(null);
  const projection = useRef({ focus: { key: '', at: 0 }, active: { key: '', at: 0 } });

  const rememberSnapshot = useCallback((snapshot) => {
    stateRef.current = snapshot;
    const at = performance.now();
    const focus = snapshot?.focus;
    const focusKey = (focus?.plan?.id || 'break') + ':' + (focus?.plan?.status || '') + ':' +
      (focus?.plan?.elapsedMs || 0) + ':' + (focus?.breakRemainingMs || 0);
    if (projection.current.focus.key !== focusKey) projection.current.focus = { key: focusKey, at };
    const attempt = snapshot?.fishing?.attempt;
    const activeKey = (attempt?.id || '') + ':' + (attempt?.gaugeElapsedMs || 0) + ':' + Boolean(attempt?.gaugeRunning);
    if (projection.current.active.key !== activeKey) projection.current.active = { key: activeKey, at };
    setState(snapshot);
  }, []);
  useEffect(() => session.subscribe(rememberSnapshot), [session, rememberSnapshot]);

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    session.load().then(async (result) => {
      if (result.recovery?.recovered) toast.info(result.recovery.message || '已从备用存档恢复');
      const loaded = session.snapshot;
      lastResultId.current = loaded?.fishing?.lastResult?.attemptId || null;
      completionCount.current = loaded?.focus?.completedPlanIds?.length || 0;
      ticketCount.current = loaded?.freeTravelTickets || 0;
      if (loaded?.arrivalEvent && loaded.arrivalEvent.sequence > loaded.arrivalConsumedSequence) {
        await session.dispatch({ type: 'CONSUME_ARRIVAL', id: crypto.randomUUID(), sequence: loaded.arrivalEvent.sequence });
      }
    }).catch((e) => { runtimeSuspended.current = true; setError(e.message); })
      .finally(() => { bootCompleted.current = true; setBooted(true); });
  }, [session]);

  const showSpeech = useCallback((line) => {
    if (!line) return;
    clearTimeout(speechTimer.current);
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
      document.removeEventListener('pointerdown', gesture);
      document.removeEventListener('keydown', gesture);
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
        if (claimed.lastCommittedCommandId === claimId && claimed.arrivalConsumedSequence === event.sequence) {
          const fishIds = REGIONS.find((region) => region.id === event.regionId)?.fish.map(([id]) => id) || [];
          showSpeech(director.arrival(event.regionId, session.now(), FISH.filter((fish) => fishIds.includes(fish.id)).map((fish) => fish.name)));
        }
      }
      if (message) toast.success(typeof message === 'function' ? message(result) : message,
        messageId ? { id: messageId, duration: 1800 } : undefined);
      return result;
    } catch (e) {
      toast.error(e.message, { id: 'game-command-error' });
      if (session.blocked) setError(e.message);
      return null;
    } finally { setPending((n) => n - 1); }
  }, [session, director, showSpeech]);

  useEffect(() => {
    const pump = new FishingRuntimePump({ session, dispatch: run });
    runtimePump.current = pump;
    const timer = setInterval(() => {
      const now = session.now();
      setNowMs(now);
      if (!bootCompleted.current || runtimeSuspended.current || !session.snapshot || session.blocked) return;
      void pump.tick(now, performance.now()).catch((e) => {
        toast.error(e.message, { id: 'runtime-timer-error' });
        if (session.blocked) setError(e.message);
      });
      const current = session.snapshot;
      if (current.fishing?.mode === 'ordinary' && current.fishing.phase === 'waiting' && !document.hidden
        && current.focus?.plan?.status !== 'running' && now >= chatterDue.current) {
        say('idle');
        chatterDue.current = now + randInt(FISHING_CONFIG.speechMinSeconds, FISHING_CONFIG.speechMaxSeconds) * 1000;
      }
    }, RUNTIME_INTERVAL_MS);
    return () => { clearInterval(timer); if (runtimePump.current === pump) runtimePump.current = null; };
  }, [run, say, session]);

  useEffect(() => {
    const pauseGauge = () => {
      const current = session.snapshot;
      if (current?.fishing?.phase === 'gauge' && current.fishing.attempt?.gaugeRunning) void run('PAUSE_ACTIVE_BAR');
    };
    const visibility = () => { if (document.hidden) pauseGauge(); };
    const freeze = (type) => {
      runtimeSuspended.current = true;
      session.suspendRuntimeClock?.();
      audioRef.current?.invalidate();
      lifecycleWork.current = lifecycleWork.current.catch(() => {}).then(async () => {
        if (!session.snapshot || session.blocked) return;
        // Frozen credit contains only time observed before suspend/shutdown.
        await run('FOCUS_TICK');
        await run('TICK_ACTIVE');
        await run('RECOVER_RUNTIME');
      }).finally(() => {
        if (type === 'shutdown') void Promise.resolve(window.pondDesktop?.ackLifecycle?.('shutdown')).catch(() => {});
      });
      return lifecycleWork.current;
    };
    const resume = () => {
      void lifecycleWork.current.catch(() => {}).then(() => {
        session.resumeRuntimeClock?.();
        runtimePump.current?.reset(performance.now());
        runtimeSuspended.current = false;
        setNowMs(session.now());
      });
    };
    const lifecycle = (event) => {
      if (event?.type === 'suspend' || event?.type === 'shutdown') void freeze(event.type);
      else if (event?.type === 'resume') resume();
    };
    const leave = () => { void freeze('pagehide'); };
    const unsubscribe = window.pondDesktop?.onLifecycle?.(lifecycle);
    window.addEventListener('blur', pauseGauge);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', resume);
    return () => {
      unsubscribe?.();
      window.removeEventListener('blur', pauseGauge);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', resume);
    };
  }, [run, session]);

  useEffect(() => {
    director.reset(); audioRef.current?.invalidate();
    chatterDue.current = session.now() + FISHING_CONFIG.firstSpeechMinSeconds * 1000;
    if (stateRef.current?.travel) { clearTimeout(speechTimer.current); setSpeech(null); }
  }, [state?.currentRegion, state?.travel?.id, director, session]);

  useEffect(() => {
    const current = session.snapshot;
    const fishing = current?.fishing;
    const attempt = fishing?.attempt;
    if (fishing?.mode !== 'ordinary' || fishing.phase !== 'bite' || !attempt) return;
    const now = session.now();
    if (now < attempt.deadlineMs && (attempt.biteAtMs || attempt.waitUntilMs) >= lastVisibleAt.current) {
      void audioRef.current?.bite({ id: attempt.id, expiresAtMs: attempt.deadlineMs }, current.settings);
    }
  }, [state?.fishing?.attempt?.id, state?.fishing?.phase, session]);

  useEffect(() => {
    const result = state?.fishing?.lastResult;
    if (!result?.attemptId || result.attemptId === lastResultId.current) return;
    lastResultId.current = result.attemptId;
    if (!result.success) {
      if (result.mode === 'active') toast.info('这一次没收住，机会已使用；可以再抛一轮');
      else if (!document.hidden && state?.focus?.plan?.status !== 'running') say('miss');
      return;
    }
    // Quiet focus/background catches still remain durable in the bucket.
    if (document.hidden || (result.mode !== 'active' && state?.focus?.plan?.status === 'running')) return;
    const fish = state.bucket.find((entry) => entry.uid === result.uid);
    if (result.kind === 'fish' && fish) {
      const high = ['epic', 'legendary'].includes(fish.quality);
      say(high ? 'high' : fish.quality === 'rare' ? 'rare' : 'success', high ? 'high' : 'success');
      toast.success('钓到「' + qualityById(fish.quality).name + '·' + fish.name + '」 ' + fish.length + 'cm / ' + fish.weight + 'kg');
    } else if (result.kind === 'item') {
      const item = state.items.find((entry) => entry.uid === result.uid);
      say('item', 'success');
      toast.success('钓到「' + (item ? itemName(item) : '物品') + '」 · 在鱼篓的物品栏查看');
    } else toast.success('收获已保存到鱼篓');
  }, [state, say]);

  useEffect(() => {
    const completed = state?.focus?.completedPlanIds?.length || 0;
    if (completed > completionCount.current) toast.success('番茄计划完成，高级鱼饵 +1', { id: 'focus-complete' });
    completionCount.current = completed;
    const tickets = state?.freeTravelTickets || 0;
    if (tickets > ticketCount.current) toast.success('今日目标完成，自由行通票 +1', { id: 'focus-daily-ticket' });
    ticketCount.current = tickets;
  }, [state?.focus?.completedPlanIds?.length, state?.freeTravelTickets]);

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
      lastResultId.current = session.snapshot?.fishing?.lastResult?.attemptId || null;
    } catch (e) { setError(e.message); }
    finally { setPending((n) => n - 1); }
  }, [session]);

  const catchFish = useCallback(async () => {
    const current = session.snapshot;
    const attempt = current?.fishing?.attempt;
    if (current?.travel || current?.fishing?.mode !== 'ordinary' || current?.fishing?.phase !== 'bite'
      || !attempt || session.now() >= attempt.deadlineMs || manualCatchPending.current) return null;
    manualCatchPending.current = true;
    audioRef.current?.invalidate();
    try { return await run('RESOLVE_BITE', { attemptId: attempt.id, manual: true }); }
    finally { manualCatchPending.current = false; }
  }, [run, session]);

  const pokeBobber = useCallback(() => {
    const current = session.snapshot;
    if (current?.travel || current?.fishing?.phase === 'bite' || current?.fishing?.mode === 'active') return;
    showSpeech(director.poke(session.now()));
  }, [showSpeech, director, session]);

  const startActiveFishing = useCallback(async () => {
    const result = await run('START_ACTIVE');
    return result?.fishing?.phase === 'ready' ? run('CAST_ACTIVE') : result;
  }, [run]);
  const stopFishing = useCallback(async () => {
    if (session.snapshot?.fishing?.phase === 'gauge') {
      if (!await run('CANCEL_ACTIVE_BAR')) return null;
    }
    return run('STOP_FISHING');
  }, [run, session]);

  const importSave = useCallback(async () => {
    if (!repository.importSave) return toast.info('请使用 Windows 桌面版导入存档');
    setPending((n) => n + 1);
    runtimeSuspended.current = true;
    try {
      await session.enqueue(async () => {
        const result = await repository.importSave();
        if (!result?.canceled) {
          await session.load();
          director.reset(); audioRef.current?.invalidate(); clearTimeout(speechTimer.current); setSpeech(null);
          const loaded = session.snapshot;
          lastResultId.current = loaded?.fishing?.lastResult?.attemptId || null;
          completionCount.current = loaded?.focus?.completedPlanIds?.length || 0;
          ticketCount.current = loaded?.freeTravelTickets || 0;
          if (loaded?.arrivalEvent && loaded.arrivalEvent.sequence > loaded.arrivalConsumedSequence) {
            const command = { type: 'CONSUME_ARRIVAL', id: crypto.randomUUID(), sequence: loaded.arrivalEvent.sequence };
            await session.commit(applyCommand(loaded, command, session.now()), command.id);
          }
          setError(''); session.blocked = false; toast.success('存档已导入');
        }
      });
    } catch (e) { toast.error(e.message); }
    finally {
      runtimeSuspended.current = false;
      runtimePump.current?.reset(performance.now());
      setPending((n) => n - 1);
    }
  }, [repository, session, director]);
  const exportSave = useCallback(async () => {
    try { if (session.snapshot) await repository.exportSave(session.snapshot); }
    catch (e) { toast.error(e.message); }
  }, [repository, session]);
  const visitGeo = useCallback((regionId) => run('GEO_VISIT', { regionId }), [run]);

  const view = fishingView(state, nowMs);
  const projectionExtra = (kind, running) => {
    if (!running || runtimeSuspended.current) return 0;
    if (session.peekRuntimeElapsed) return session.peekRuntimeElapsed(kind);
    return Math.min(10000, Math.max(0, performance.now() - projection.current[kind].at));
  };
  const attempt = state?.fishing?.attempt;
  const activeElapsed = Math.min(ACTIVE_FISHING_CONFIG.gaugeTimeoutMs,
    (attempt?.gaugeElapsedMs || 0) + projectionExtra('active', state?.fishing?.phase === 'gauge' && attempt?.gaugeRunning));
  const activeBar = state?.fishing?.phase === 'gauge' ? { attemptId: attempt.id,
    elapsedMs: activeElapsed, remainingMs: Math.max(0, ACTIVE_FISHING_CONFIG.gaugeTimeoutMs - activeElapsed),
    paused: !attempt.gaugeRunning, position: gaugePosition(activeElapsed) } : null;
  const plan = state?.focus?.plan;
  const focusElapsed = Math.min(plan?.durationMs || FOCUS_CONFIG.durationMs,
    (plan?.elapsedMs || 0) + projectionExtra('focus', plan?.status === 'running'));
  const breakLeft = Math.max(0, (state?.focus?.breakRemainingMs || 0)
    - projectionExtra('focus', !plan && state?.focus?.breakRemainingMs > 0));
  const focusDay = plan?.dayKey || localDayKey(nowMs);
  const focusView = { status: plan?.status || (breakLeft > 0 ? 'break' : 'idle'),
    title: plan?.title || '', elapsedMs: plan ? focusElapsed : 0,
    durationMs: plan?.durationMs || FOCUS_CONFIG.durationMs,
    remainingMs: plan ? Math.max(0, plan.durationMs - focusElapsed) : FOCUS_CONFIG.durationMs,
    breakRemainingMs: breakLeft, dayKey: focusDay,
    dayCompleted: state?.focus?.days?.[focusDay]?.completedCount || 0,
    dailyTarget: FOCUS_CONFIG.dailyPlans, freeTravelTickets: state?.freeTravelTickets || 0 };

  return { ...(state || {}), state, ready: !!state, booted, error, busy: pending > 0, nowMs, initialize,
    ...view, speech, catchFish, pokeBobber, importSave, exportSave, visitGeo, audioBlocked,
    focusView, activeBar, activePointer: activeBar?.position ?? 0,
    castIndex: attempt?.completedSwings || 0, targetSwings: attempt?.targetSwings || 0,
    activeRemaining: state?.activePass?.remaining || 0,
    startFishing: () => run('START_FISHING'),
    stopFishing, stopActiveFishing: stopFishing,
    setFishingBait: (enabled) => run('SET_FISHING_BAIT', { enabled }),
    setUseBait: (enabled) => run('SET_FISHING_BAIT', { enabled }),
    startActiveFishing, castActive: () => run('CAST_ACTIVE'),
    resumeActiveFishing: () => run('RESUME_ACTIVE_BAR'),
    pauseActiveFishing: () => run('PAUSE_ACTIVE_BAR'),
    stopActiveBar: () => run('STOP_ACTIVE_BAR'),
    cancelActiveAttempt: () => run('CANCEL_ACTIVE_BAR'),
    buyActivePass: () => run('BUY_ACTIVE_PASS', {}, '主动竿已备好，含15次收鱼机会'),
    startFocus: (title) => run('START_FOCUS', { title }),
    pauseFocus: () => run('PAUSE_FOCUS'), resumeFocus: () => run('RESUME_FOCUS'),
    cancelFocus: () => run('CANCEL_FOCUS'),
    enableAudio: async () => { const ok = await audioRef.current?.unlock(); setAudioBlocked(!ok); return ok; },
    sellItem: (uid) => run('SELL_ITEM', { uid }, '物品已出售'),
    repairItem: (uid) => run('REPAIR_ITEM', { uid }, '修理完成，结果已保存'),
    useItem: (uid) => run('USE_ITEM', { uid }, '道具效果已保存'),
    visitRealRegion: () => run('REAL_VISIT', {}, '已来到现实所在地的水域'),
    sellOne: (uid) => run('SELL_ONE', { uid }, '鱼已卖出，图鉴记录已保留'),
    sellAll: () => run('SELL_ALL', {}, '鱼篓已卖出，金币已保存'),
    buyBait: () => run('BUY_BAIT', {}, '高级鱼饵已放入背包'),
    buyAppearance: (productId) => run('BUY_APPEARANCE', { productId }, '已收藏，外观权益已保存', 'appearance-purchase'),
    equipAppearance: (slot, styleId) => run('EQUIP_APPEARANCE', { slot, styleId }),
    travelTo: (toId, payment = 'coins') => run('START_TRAVEL', { toId, payment }, payment === 'free' ? '通票已使用，正在飞往目的地' : '机票已购买，正在飞往目的地'),
    updateSettings: (patch) => run('SETTINGS', { patch }),
  };
}

