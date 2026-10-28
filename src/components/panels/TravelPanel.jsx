import { Plane, Check, Lock, MapPin, Compass, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REGIONS } from '@/lib/gameConfig';
import { regionById } from '@/lib/gameUtils';
import { quoteRoute } from '@/domain/routes';
import { REGION_LOCATIONS } from '@/data/regionLocations';
import { useState } from 'react';
import { quoteTicketPayment } from '@/domain/editionGameplay';

const GEO_HINT = { pending: '正在识别本次 IP 所在地…', ip: '本次 IP 所在水域已免费解锁（接受 VPN）',
  'ip-cached': '沿用上次位置；联网后会重新识别', fallback: '暂未定位，已保留原有解锁',
  default: '所在地区暂未匹配到水域', oversea: '暂未匹配到国内水域', disabled: '在线定位已关闭' };
const point = (id) => {
  const p = REGION_LOCATIONS[id];
  return { x: 25 + (p.longitude - 84) / 44 * 525, y: 185 - (p.latitude - 18) / 30 * 155 };
};

const TravelPanel = ({ game, coins, currentRegion, unlockedRegions, realRegion, geoSource, onTravel, onVisitReal, travel, busy }) => {
  const from = point(currentRegion);
  const [payment, setPayment] = useState('coins');
  const freeTickets = game?.freeTravelTickets || 0;
  const chosenPayment = payment === 'free' && freeTickets > 0 ? 'free' : 'coins';
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white/5 p-3 text-xs"><label className="flex items-center justify-between gap-3"><span>出行支付 · 免费通票 {freeTickets} 张</span><select aria-label="机票支付方式" className="rounded bg-slate-800 p-2 text-slate-100" value={chosenPayment} disabled={busy || !!travel} onChange={event => setPayment(event.target.value)}><option value="coins">金币购票{game?.discounts?.ticket ? ' · 已有九折' : ''}</option><option value="free" disabled={freeTickets < 1}>使用一张免费通票</option></select></label><p className="mt-2 text-slate-400">每天完成4个番茄计划获一张单程通票；使用通票保留机票九折机会。</p></div>
      <p className="flex gap-2 text-xs leading-relaxed text-slate-400"><Compass size={16} className="shrink-0 text-sky-300" />
        现实中到过的地方，也属于你的鱼塘。每次启动联网识别 IP 后，会永久免费解锁对应水域；游戏内漫游则按出发地购买机票。</p>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs">
        <span className="text-emerald-200">现实所在地：{regionById(realRegion)?.name || '暂未识别'}<span className="mt-1 block text-slate-400">{GEO_HINT[geoSource] || '定位结果会自动保存'}</span></span>
        {realRegion && realRegion !== currentRegion && <Button size="sm" variant="outline" disabled={busy || !!travel} onClick={onVisitReal}><Navigation size={13} className="mr-1" />在当地垂钓 · 免费</Button>}
      </div>
      <svg viewBox="0 0 600 225" className="w-full rounded-xl bg-slate-950/35" role="img" aria-label="从当前水域出发的全国航线示意图">
        {REGIONS.filter((r) => r.id !== currentRegion).map((r) => {
          const to = point(r.id);
          return <line key={r.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={travel?.toId === r.id ? '#a25f45' : '#658575'} strokeOpacity={travel?.toId === r.id ? 0.9 : 0.19} strokeWidth={travel?.toId === r.id ? 2 : 1} />;
        })}
        {REGIONS.map((r) => { const p = point(r.id); return <g key={r.id}><circle cx={p.x} cy={p.y} r={r.id === currentRegion ? 5 : 3.5} fill={r.id === currentRegion ? '#4b7961' : unlockedRegions.includes(r.id) ? '#839989' : '#a8aaa0'} /><text x={p.x + 7} y={p.y - 7} fontSize="10" fill="#4d6558">{REGION_LOCATIONS[r.id].city}</text></g>; })}
        <text x="16" y="212" fontSize="9" fill="#647364">代表城市直达路线示意 · 地区已解锁 ≠ 游戏航程免费 · 最近 1 分钟，最远 3 分钟</text>
      </svg>
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {REGIONS.map((r) => {
          const current = r.id === currentRegion, unlocked = unlockedRegions.includes(r.id);
          const route = quoteRoute(currentRegion, r.id);
          const quote = route && game ? quoteTicketPayment(game.state, route, chosenPayment) : { farePaid: route?.price || 0 };
          const Icon = current ? MapPin : unlocked ? Check : Lock;
          return <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3">
            <div className="min-w-0"><div className="flex items-center gap-2"><Icon size={15} className={unlocked ? 'shrink-0 text-sky-300' : 'shrink-0 text-slate-500'} /><span className="text-sm font-medium">{r.name}</span></div>
              <p className="mt-1 text-xs text-slate-500">{current ? '鱼竿已经架好' : `${Math.round(route.distanceKm)} km · ${Math.ceil(route.durationMs / 1000)} 秒 · ${unlocked ? '已解锁' : '抵达后解锁'}`}</p></div>
            {current ? <span className="shrink-0 text-xs text-emerald-300">当前水域</span> : <Button size="sm" variant={unlocked ? 'outline' : 'default'} disabled={busy || !!travel || coins < quote.farePaid} onClick={() => onTravel(r.id, chosenPayment)} className="shrink-0"><Plane size={13} className="mr-1" />{chosenPayment === 'free' ? '通票出发 · 免费' : `机票 ¥${quote.farePaid}`}</Button>}
          </div>;
        })}
      </div>
    </div>
  );
};
export default TravelPanel;

