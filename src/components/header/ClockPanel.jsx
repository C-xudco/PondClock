import { Sun, Cloud, CloudRain, Snowflake, MapPin } from 'lucide-react';
const weatherIcon = (weather = '') => /雪/.test(weather) ? Snowflake : /雨|雷/.test(weather) ? CloudRain : /晴/.test(weather) ? Sun : Cloud;
const sourceLabel = (source) => ({ online: '实况', cached: '缓存', cache: '缓存', simulated: '离线模拟', simulation: '离线模拟' })[source] || '待获取';

export default function ClockPanel({ time, date, weather, season, regionName, temperature, weatherSource,
  weatherUpdatedAt, weatherPlace, weatherError, weatherRefreshing }) {
  const Icon = weatherIcon(weather);
  return <section className="clock-panel ink-card" aria-label="现实所在地时钟与天气">
    <div className="clock-left"><span className="clock-time">{time}</span><div className="clock-date"><span>{date}</span><span>{season} · 现实所在地</span></div></div>
    <div className="weather-display" title={[weatherError, weatherUpdatedAt ? `观测时刻 ${new Date(weatherUpdatedAt).toLocaleString('zh-CN')}` : '暂无实时观测；离线仍可玩'].filter(Boolean).join('\n')}>
      <div className="weather-current"><Icon size={15} /><span>{Number.isFinite(temperature) ? `${Math.round(temperature)}° ` : ''}{weather || '待获取'}</span></div>
      <span className="weather-detail"><MapPin size={10} />{weatherPlace || regionName || '所在地待识别'} · {weatherRefreshing ? '更新中' : sourceLabel(weatherSource)}</span>
    </div>
  </section>;
}
