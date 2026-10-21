import { X } from "lucide-react";

// 点击功能坞后展开的玻璃面板；关闭后不渲染任何内容（"不点击不展开"）
const PanelWindow = ({ title, onClose, children, floating = false }) => (
  <section
    id="fishing-panel"
    role="region"
    aria-label={title}
    className={`${floating ? 'widget-panel' : 'mt-3'} overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-2 duration-200`}
  >
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="收起面板"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
    <div className={`${floating ? 'min-h-0 flex-1' : 'max-h-[46vh]'} overflow-y-auto px-4 py-4`}>{children}</div>
  </section>
);

export default PanelWindow;
