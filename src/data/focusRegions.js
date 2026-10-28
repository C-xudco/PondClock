// V2 first-edition additions. Numeric ranges and weights are game parameters.
// See fishSources.js for evidence; no exact-landmark wild census is implied.
export const FOCUS_FISH = Object.freeze([
  { id: 'maisui', name: '麦穗鱼', basePrice: 25, len: [3, 10], wt: [0.01, 0.06], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: '太湖与白洋淀缓流、水草边的小型鱼' },
  { id: 'huahuan', name: '花䱻', basePrice: 31, len: [12, 35], wt: [0.1, 1.5], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: '太湖、白洋淀水系中下层；与唇䱻分种' },
  { id: 'hechuanshatangli', name: '河川沙塘鳢', basePrice: 31, len: [6, 15], wt: [0.03, 0.25], qw: { common: 88.5, rare: 10, epic: 1.3, legendary: 0.2 }, habitat: '太湖浅岸底层，常见于缓流和遮蔽物附近' },
  { id: 'xushipingyou', name: '许氏平鲉', basePrice: 40, len: [15, 45], wt: [0.2, 2], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: '威海近岸礁石与沙石底水域' },
  { id: 'dalongliuxian', name: '大泷六线鱼', basePrice: 36, len: [15, 40], wt: [0.15, 1.5], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: '威海近岸岩礁底层' },
  { id: 'heidiao', name: '黑鲷', basePrice: 41, len: [18, 45], wt: [0.2, 2.5], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: '威海近岸岩沙底海域' },
]);

export const FOCUS_REGIONS = Object.freeze([
  { id: 'taihu', name: '江南·太湖', waterSystem: '太湖湖区与周边水网', tier: 13, flightPrice: 0,
    fish: [['jiyu', 23], ['liyu', 18], ['baitiao', 10], ['lianyu', 10], ['huangsang', 10], ['qiaozuibai', 7], ['maisui', 8], ['huahuan', 7], ['hechuanshatangli', 7]] },
  { id: 'dongting', name: '湖湘·洞庭湖', waterSystem: '洞庭湖通江湖区', tier: 14, flightPrice: 0,
    fish: [['jiyu', 16], ['liyu', 14], ['caoyu', 16], ['lianyu', 14], ['yongyu', 14], ['huangsang', 12], ['qingyu', 8], ['nianyu', 6]] },
  { id: 'jialing', name: '川渝·嘉陵江', waterSystem: '嘉陵江干支流水域；代表合川汇流', tier: 15, flightPrice: 0,
    fish: [['liyu', 20], ['jiyu', 18], ['caoyu', 16], ['lianyu', 12], ['yongyu', 12], ['qingyu', 8], ['huangsang', 8], ['nianyu', 6]] },
  { id: 'baiyangdian', name: '华北·白洋淀', waterSystem: '海河流域大清河水系白洋淀湖群', tier: 16, flightPrice: 0,
    fish: [['jiyu', 30], ['liyu', 20], ['huangsang', 15], ['nianyu', 10], ['maisui', 15], ['huahuan', 10]] },
  { id: 'jiaodong', name: '胶东·威海近海', waterSystem: '威海湾及胶东近岸海域', tier: 17, flightPrice: 0,
    fish: [['hualu', 24], ['xushipingyou', 28], ['dalongliuxian', 28], ['heidiao', 20]] },
]);

// Exact city labels only: a province alone must never unlock a lake or bay.
// Romanized Suzhou is accepted only with Jiangsu, not Anhui's 宿州.
const CITY_MATCHES = Object.freeze([
  { regionId: 'taihu', cities: ['无锡', 'wuxi', '苏州', 'suzhou'], provinces: ['江苏', 'jiangsu', 'js'] },
  { regionId: 'taihu', cities: ['湖州', 'huzhou'], provinces: ['浙江', 'zhejiang', 'zj'] },
  { regionId: 'dongting', cities: ['岳阳', 'yueyang'], provinces: ['湖南', 'hunan', 'hn'] },
  { regionId: 'jialing', cities: ['合川', 'hechuan'], provinces: ['重庆', 'chongqing', 'cq'] },
  { regionId: 'baiyangdian', cities: ['安新', 'anxin', '雄安', 'xiongan'], provinces: ['河北', 'hebei', 'he'] },
  { regionId: 'jiaodong', cities: ['威海', 'weihai'], provinces: ['山东', 'shandong', 'sd'] },
]);
const token = value => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/\s+/g, '').replace(/^cn[-_]/, '').replace(/(?:省|市|区|县|新区)$/, '') : '';
export function matchDetailedRegionForCity(city, province) {
  const cityToken = token(city), provinceToken = token(province);
  if (!cityToken || !provinceToken) return null;
  return CITY_MATCHES.find(entry => entry.cities.includes(cityToken) && entry.provinces.includes(provinceToken))?.regionId || null;
}
