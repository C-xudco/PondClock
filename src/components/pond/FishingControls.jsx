import { Play, Square, Waves } from 'lucide-react';
import { clockLabel } from '../../hooks/fishingRuntime.js';

export default function FishingControls({ game, disabled = false, onOpenFocus }) {
  const mode = game.fishing?.mode || 'stopped';
  const active = mode === 'active';
  const running = mode !== 'stopped';
  const locked = disabled || game.busy || Boolean(game.travel) || Boolean(game.error);
  const focus = game.focusView;
  const focusLabel = focus?.status === 'running' ? '专注 ' + clockLabel(focus.remainingMs)
    : focus?.status === 'paused' ? '暂停 ' + clockLabel(focus.remainingMs)
      : focus?.status === 'break' ? '休息 ' + clockLabel(focus.breakRemainingMs) : '番茄钟';
  const actionClass = 'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors disabled:opacity-40';
  return <div className="fishing-controls mt-2 flex flex-wrap items-center justify-between gap-1" role="group" aria-label="钓鱼控制">
    <div className="flex items-center gap-1">
      <button type="button" disabled={locked} onClick={running ? game.stopFishing : game.startFishing}
        className={actionClass + (running ? ' bg-white/5 text-slate-300 hover:bg-white/10' : ' bg-sky-400/15 text-sky-200 hover:bg-sky-400/25')}>
        {running ? <Square size={11} /> : <Play size={11} />}{running ? '停止钓鱼' : '开始钓鱼'}
      </button>
      {!game.activeBar && <button type="button" disabled={locked || game.activeRemaining <= 0 || game.activePhase === 'casting'}
        onClick={active && game.activePhase === 'ready' ? game.castActive : game.startActiveFishing}
        className={actionClass + ' bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20'}>
        <Waves size={11} />{game.activePhase === 'casting' ? '挥杆中…' : active ? '再抛一轮' : '主动抛竿'}
        <span className="tabular-nums opacity-70">{game.activeRemaining}</span>
      </button>}
      {onOpenFocus && <button type="button" aria-label="打开专注计划" className={actionClass + ' tabular-nums text-slate-300 hover:bg-white/10'} onClick={onOpenFocus}>{focusLabel}</button>}
    </div>
    <label className="flex items-center gap-1 text-[10px] text-slate-400" data-no-active-key>
      <input type="checkbox" checked={Boolean(game.fishing?.useBait)} disabled={locked || active}
        aria-label="普通钓鱼使用高级饵" onChange={(event) => void game.setFishingBait(event.target.checked)} className="accent-sky-300" />
      用高级饵
    </label>
  </div>;
}
