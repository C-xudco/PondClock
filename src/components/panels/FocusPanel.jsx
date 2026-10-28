import { useState } from 'react';
import { Pause, Play, Timer, Ticket, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { clockLabel, localDayKey } from '../../hooks/fishingRuntime.js';

export default function FocusPanel({ game, disabled = false }) {
  const [title, setTitle] = useState('');
  const view = game.focusView;
  if (!view) return null;
  const planned = view.status === 'running' || view.status === 'paused';
  const locked = disabled || game.busy || Boolean(game.error);
  const percent = Math.min(100, Math.max(0, view.elapsedMs / view.durationMs * 100));
  const start = (event) => {
    event?.preventDefault();
    if (!planned && title.trim() && !locked) void game.startFocus(title.trim());
  };
  const today = localDayKey(game.nowMs);
  return <div className="focus-panel space-y-4" data-no-active-key>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium"><Timer size={16} /> 一轮专注，一池静水</h3>
        <p className="mt-1 text-xs text-slate-400">25分钟专注，完成后休息5分钟。</p>
      </div>
      <span className="shrink-0 rounded-full bg-sky-400/10 px-2 py-1 text-xs text-sky-200">每轮高级饵 +1</span>
    </div>

    {planned ? <section aria-label="当前专注计划" className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="break-words text-sm text-slate-100">{view.title}</p>
      <p role="timer" aria-label="专注剩余时间" className="my-3 text-center text-4xl font-light tabular-nums text-sky-100">{clockLabel(view.remainingMs)}</p>
      <div role="progressbar" aria-label="本轮专注进度" aria-valuenow={Math.floor(percent)} aria-valuemin={0} aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sky-300 transition-all" style={{ width: String(percent) + '%' }} />
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">{view.status === 'paused' ? '已暂停，继续后接着计时' : '可以切到其他软件，专注仍在继续'}</p>
      <div className="mt-3 flex justify-center gap-2">
        <Button size="sm" disabled={locked} onClick={view.status === 'paused' ? game.resumeFocus : game.pauseFocus}>
          {view.status === 'paused' ? <Play size={13} /> : <Pause size={13} />}<span className="ml-1">{view.status === 'paused' ? '继续专注' : '暂停'}</span>
        </Button>
        <Button size="sm" variant="outline" disabled={locked} onClick={game.cancelFocus}>取消本轮</Button>
      </div>
    </section> : <form onSubmit={start} className="space-y-3">
      {view.status === 'break' && <p role="status" className="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-200">
        上一轮完成了。歇一会儿，剩余 {clockLabel(view.breakRemainingMs)}。
      </p>}
      <label className="block text-xs text-slate-300" htmlFor="focus-plan-title">这25分钟，想完成什么？</label>
      <input id="focus-plan-title" name="focus-title" value={title} maxLength={60} autoComplete="off"
        onChange={(event) => setTitle(event.target.value)} placeholder="例如：读完一节书、写好一页方案"
        disabled={locked} className="w-full rounded-lg border border-white/15 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-300/50 focus:outline-none" />
      <Button type="submit" size="sm" disabled={locked || !title.trim()}><Play size={13} /><span className="ml-1">{view.status === 'break' ? '提前结束休息，开始下一轮' : '开始25分钟'}</span></Button>
    </form>}

    <section className="rounded-xl border border-white/10 p-3" aria-label="每日专注奖励">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300">{view.dayKey === today ? '今日完成' : '计划归属日 ' + view.dayKey}</span>
        <span className="tabular-nums text-sky-200">{view.dayCompleted} / {view.dailyTarget} 轮</span>
      </div>
      <div className="mt-2 flex gap-2" aria-label={String(view.dayCompleted) + '轮已完成'}>
        {Array.from({ length: view.dailyTarget }, (_, index) => <CheckCircle2 key={index} size={18}
          className={index < view.dayCompleted ? 'text-emerald-300' : 'text-slate-600'} aria-hidden="true" />)}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">完成4轮，获得一张任意目的地的免费单程通票；每天一次，可留到以后使用。</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-amber-200"><Ticket size={13} />自由行通票：{view.freeTravelTickets} 张</p>
    </section>
    <p className="text-[11px] leading-relaxed text-slate-500">一包高级饵可用于5条成功鱼获。取消或未完成不领奖；电脑休眠、关闭应用时暂停，重新打开后可继续。</p>
  </div>;
}
