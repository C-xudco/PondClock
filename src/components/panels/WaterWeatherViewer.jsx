import { useState } from 'react';
import { REGIONS } from '@/lib/gameConfig';
import { useRegionWeather } from '@/hooks/useRegionWeather';
import { Button } from '@/components/ui/button';

export default function WaterWeatherViewer({ currentRegion, online }) {
  const [selected, setSelected] = useState(currentRegion);
  const weather = useRegionWeather(selected, online, { priority: 'viewer' });
  return <section className="rounded-xl bg-white/5 p-3" aria-label="各水域天气查看">
    <h3 className="font-medium text-sky-200">看看远方的天</h3>
    <p className="mt-1 text-xs leading-relaxed text-slate-400">只查看天气。上方时钟始终保留现实所在地；水墨场景随实际垂钓水域变化。</p>
    <label className="mt-3 block text-xs">查看水域<select className="ink-select mt-1 block w-full" aria-label="选择查看水域" value={selected} onChange={(event) => setSelected(event.target.value)}>{REGIONS.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
    <p className="mt-3 text-sm font-medium">{weather.site?.place || weather.weatherPlace}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">{weather.site?.address || '地点资料待补充'}</p>
    <p className="mt-1 text-xs text-slate-500">{weather.site?.weatherReferenceLabel}</p>
    <p className="mt-2 text-sm" role="status">{weather.weather || '待获取'} {Number.isFinite(weather.temperature) ? `${Math.round(weather.temperature)}°C` : ''} · {weather.weatherRefreshing ? '获取中' : ({ online: '联网天气', cached: '缓存天气', simulated: '离线模拟' })[weather.weatherSource] || '待获取'}</p>
    {weather.weatherUpdatedAt && <p className="mt-1 text-xs text-slate-500">观测：{new Date(weather.weatherUpdatedAt).toLocaleString('zh-CN')}</p>}
    {weather.weatherError && <p className="mt-2 text-xs text-amber-200">{weather.weatherError}</p>}
    <Button className="mt-3" size="sm" variant="outline" disabled={!online || weather.weatherRefreshing} onClick={() => void weather.refreshWeather()}>刷新此水域天气</Button>
  </section>;
}
