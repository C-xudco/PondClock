import { Sun, Cloud, CloudRain, Snowflake } from "lucide-react";

const WEATHER_ICONS = { "晴": Sun, "多云": Cloud, "小雨": CloudRain, "雪": Snowflake };

// 桌面时钟条：半透明玻璃质感，只占一行，尽量不抢水塘画面
const ClockPanel = ({ time, date, weather, season, regionName, temperature, weatherSource, weatherUpdatedAt, weatherPlace }) => {
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
      <div className="flex items-center gap-2 text-sm text-slate-200" title={weatherUpdatedAt ? `天气更新于 ${new Date(weatherUpdatedAt).toLocaleString('zh-CN')}` : '天气仅影响画面'}>
        <Icon size={18} className="text-amber-300" />
        <span>{Number.isFinite(temperature) ? `${Math.round(temperature)}° ` : ''}{weather}<span className="mt-0.5 block text-right text-[10px] text-slate-500">{weatherPlace || '当地'} · {({ online: '当地天气', cache: '缓存天气', cached: '缓存天气', simulated: '离线模拟', simulation: '离线模拟' })[weatherSource] || '离线模拟'}</span></span>
      </div>
    </div>
  );
};

export default ClockPanel;
