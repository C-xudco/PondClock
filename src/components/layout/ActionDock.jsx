import { Coins, Fish, BookOpen, Wrench, Plane } from "lucide-react";

// 底部功能坞：默认只露出图标按钮，点击后由 Index 展开对应面板
export const DOCK_ITEMS = [
  { id: "bucket", label: "鱼篓", icon: Fish },
  { id: "codex", label: "图鉴", icon: BookOpen },
  { id: "shop", label: "渔具店", icon: Wrench },
  { id: "travel", label: "漫游", icon: Plane },
];

const ActionDock = ({ coins, activePanel, onToggle }) => (
  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 shadow-xl backdrop-blur-md">
    <div className="flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-1.5 text-sm font-medium text-amber-300">
      <Coins size={16} />
      <span className="tabular-nums">¥{coins}</span>
    </div>

    <div className="flex items-center gap-1" role="group" aria-label="功能面板">
      {DOCK_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activePanel === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-expanded={active}
            aria-controls="fishing-panel"
            onClick={() => onToggle(id)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-sky-300/30 bg-sky-400/15 text-sky-200"
                : "border-transparent text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  </div>
);

export default ActionDock;
