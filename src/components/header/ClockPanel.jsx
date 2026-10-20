import { Sun, Cloud, CloudRain, Snowflake } from "lucide-react";

const WEATHER_ICONS = { "晴": Sun, "多云": Cloud, "小雨": CloudRain, "雪": Snowflake };

// 桌面时钟条：半透明玻璃质感，只占一行，尽量不抢水塘画面
const ClockPanel = ({ time, date, weather, season, regionName }) => {
  const Icon = WEATHER_ICONS[weather] || Cloud;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-2.5 shadow-xl backdrop-blur-md">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums tracking-wider text-slate-50">{time}</span>
        <span className="text-xs leading-tight text-slate-400">
          <span className="block">{date}</span>
          <span className="block">
            {season} · {regionName}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-200">
        <Icon size={18} className="text-amber-300" />
        <span>{weather}</span>
      </div>
    </div>
  );
};

export default ClockPanel;
