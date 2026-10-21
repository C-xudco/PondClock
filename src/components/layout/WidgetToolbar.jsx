import { Fish, GripHorizontal, Maximize2, Minimize2, Minus, Pin, PinOff, X } from 'lucide-react';

export default function WidgetToolbar({ desktop, busy, onToggleTop }) {
  const compact = desktop.info?.sizePreset !== 'comfortable';
  const pinned = desktop.info?.alwaysOnTop ?? false;
  return <header className="widget-toolbar drag-region" aria-label="悬浮窗控制">
    <div className="flex min-w-0 items-center gap-1.5 pl-1 text-[11px] text-slate-200" title="按住这里拖动到屏幕任意位置">
      <Fish size={13} className="text-sky-200" /><span>水塘时钟</span>
      <GripHorizontal size={14} className="ml-1 text-slate-500" /><span className="widget-drag-hint text-slate-500">拖动移动</span>
    </div>
    <div className="no-drag flex items-center gap-0.5" role="group" aria-label="窗口操作">
      <button className="widget-window-button" aria-label={compact ? '展开挂件' : '缩小挂件'} title={compact ? '展开挂件' : '缩小挂件'} onClick={() => void desktop.action(compact ? 'comfortable' : 'compact')}>
        {compact ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
      </button>
      <button className={`widget-window-button ${pinned ? 'text-sky-200' : ''}`} aria-label={pinned ? '取消窗口置顶' : '窗口置顶'} aria-pressed={pinned} title={pinned ? '已置顶，点击取消' : '让挂件保持在其他窗口前面'} disabled={busy} onClick={onToggleTop}>
        {pinned ? <Pin size={13} /> : <PinOff size={13} />}
      </button>
      <button className="widget-window-button" aria-label="最小化水塘时钟" title="最小化，可从任务栏恢复" onClick={() => void desktop.action('minimize')}><Minus size={14} /></button>
      <button className="widget-window-button widget-exit" aria-label="退出水塘时钟" title="保存并退出" onClick={() => void desktop.action('close')}><X size={14} /></button>
    </div>
  </header>;
}
