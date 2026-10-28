import { useEffect, useRef, useState } from 'react';
import { ACTIVE_FISHING_CONFIG, gaugeBand, gaugePosition } from '../../config/activeFishing.js';
import { acceptsActiveKey } from '../../hooks/fishingRuntime.js';

const colors = { white: '#e2e8f0', red: '#f87171', yellow: '#facc15', green: '#34d399' };

export default function ActiveFishingBar({ game, disabled = false, inputBlocked = false }) {
  const root = useRef(null);
  const submitted = useRef(false);
  const [sending, setSending] = useState(false);
  const bar = game.activeBar;
  const attemptId = bar?.attemptId;
  const paused = Boolean(bar?.paused);
  const sampledElapsedMs = bar?.elapsedMs ?? 0;
  const [displayElapsedMs, setDisplayElapsedMs] = useState(sampledElapsedMs);
  // Background checkpoints use the same serial session as stop commands. They
  // must not disable a timely input; the session records its accepted time.
  const locked = disabled || sending || inputBlocked || Boolean(game.error);
  useEffect(() => {
    setDisplayElapsedMs(sampledElapsedMs);
    if (!attemptId || paused) return undefined;
    const sampledAt = performance.now();
    let frame;
    const draw = () => {
      const elapsed = Math.min(ACTIVE_FISHING_CONFIG.gaugeTimeoutMs,
        sampledElapsedMs + Math.max(0, performance.now() - sampledAt));
      setDisplayElapsedMs(elapsed);
      if (elapsed < ACTIVE_FISHING_CONFIG.gaugeTimeoutMs) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [attemptId, paused, sampledElapsedMs]);
  const stop = async (cancel = false) => {
    if (submitted.current || locked || !bar || (paused && !cancel)) return;
    submitted.current = true; setSending(true);
    try { await (cancel ? game.cancelActiveAttempt() : game.stopActiveBar()); }
    finally { submitted.current = false; setSending(false); }
  };
  useEffect(() => { submitted.current = false; }, [attemptId]);
  useEffect(() => {
    // Focus only the already focused game's new gauge, never another application.
    if (attemptId && !paused && !inputBlocked && document.hasFocus()) root.current?.focus({ preventScroll: true });
  }, [attemptId, paused, inputBlocked]);
  useEffect(() => {
    if (!bar || paused || locked) return undefined;
    const onKey = (event) => {
      const panelOpen = Boolean(document.querySelector('#fishing-panel,[role="dialog"][data-state="open"]'));
      if (!acceptsActiveKey(event, { focused: document.hasFocus(), paused,
        blocked: panelOpen || inputBlocked, insideGauge: root.current?.contains(event.target) })) return;
      event.preventDefault(); event.stopPropagation();
      void stop(event.key === 'Escape');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (!bar) return null;
  // Visual interpolation only. No position is sent to the domain for a result.
  const visualElapsed = paused ? sampledElapsedMs : displayElapsedMs;
  const remainingMs = Math.max(0, ACTIVE_FISHING_CONFIG.gaugeTimeoutMs - visualElapsed);
  const position = gaugePosition(visualElapsed);
  const band = gaugeBand(position);
  return <section ref={root} tabIndex={-1} aria-label="主动收鱼进度条" className="active-fishing-bar absolute inset-x-3 bottom-3 z-30 rounded-xl border border-white/15 bg-slate-950/95 px-3 py-2 shadow-xl outline-none">
    <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
      <span>{paused ? '已暂停 · 继续后停针' : '按任意键或点收竿'}</span>
      <span className="tabular-nums text-slate-400">余 {game.activeRemaining} 次 · {(remainingMs / 1000).toFixed(1)}秒</span>
    </div>
    <div className="relative my-2" role="img" aria-label={'当前指针：' + (band?.label || '白色区域')}>
      <div className="flex h-5 overflow-hidden rounded-md">
        {ACTIVE_FISHING_CONFIG.bands.map((entry) => <div key={entry.from} aria-hidden="true"
          style={{ width: String((Math.min(10000, entry.to) - entry.from) / 100) + '%', backgroundColor: colors[entry.id] }} />)}
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute -top-1 h-7 w-0.5 -translate-x-1/2 bg-slate-950 shadow-[0_0_0_1px_white]"
        style={{ left: String(position / 100) + '%' }} />
    </div>
    <div className="flex items-center justify-between gap-1">
      <span className="text-[10px] text-slate-400">白0% · 红10% · 黄50% · 绿100%</span>
      <div className="flex gap-1">
        {paused ? <button type="button" disabled={locked} onClick={game.resumeActiveFishing}
          className="rounded-md bg-sky-300/15 px-2 py-1 text-xs text-sky-200 disabled:opacity-40">继续</button>
          : <button type="button" disabled={locked || remainingMs <= 0} onClick={() => void stop()}
            className="rounded-md bg-emerald-300/15 px-2 py-1 text-xs text-emerald-200 disabled:opacity-40">收竿</button>}
        <button type="button" disabled={locked} onClick={() => void stop(true)}
          className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-40">放弃</button>
      </div>
    </div>
  </section>;
}
