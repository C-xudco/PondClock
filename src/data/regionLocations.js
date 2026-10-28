// Fixed representative city points, not airports or exact fishing spots.
// Original12: GeoNames snapshot2026-10-20. V2 additions use published district/
// water-area references; an area point is chosen for game distance, not surveyed GPS.
const location = (city, latitude, longitude, sourceUrl, precision = 'city-reference') => Object.freeze({
  city, latitude, longitude, sourceUrl, precision,
});

export const REGION_LOCATIONS = Object.freeze({
  jiangnan: location("南京", 32.06167, 118.77778, "https://www.geonames.org/1799962/nanjing.html"),
  huaihe: location("蚌埠", 32.94083, 117.36083, "https://www.geonames.org/1816440/bengbu.html"),
  huanghe: location("郑州", 34.75778, 113.64861, "https://www.geonames.org/1784658/zhengzhou.html"),
  changjiang: location("武汉", 30.58333, 114.26667, "https://www.geonames.org/1791247"),
  dongnan: location("福州", 26.06139, 119.30611, "https://www.geonames.org/1810821/fuzhou.html"),
  lingnan: location("广州", 23.11667, 113.25, "https://www.geonames.org/1809858/guangzhou.html"),
  xinan: location("重庆", 29.56026, 106.55771, "https://www.geonames.org/1814906/chongqing.html"),
  yungui: location("昆明", 25.03889, 102.71833, "https://www.geonames.org/1804651/kunming.html"),
  hainan: location("海口", 20.03421, 110.34651, "https://www.geonames.org/1809078/haikou.html"),
  dongbei: location("哈尔滨", 45.75, 126.65, "https://www.geonames.org/2037013/harbin.html"),
  xibei: location("乌鲁木齐", 43.800965, 87.600459, "https://www.geonames.org/search.html?q=China%2F&startRow=50"),
  qingzang: location("拉萨", 29.65, 91.1, "https://www.geonames.org/1280737/lhasa.html"),
  taihu: location('无锡滨湖', 31.55, 120 + 17 / 60, 'https://www.wxbh.gov.cn/zxzx/dqgk/index.shtml', 'area-reference'),
  dongting: location('岳阳君山', 29.38, 113.10, 'https://junshan.gov.cn/32415/32465/39375/39381/content_1193499.html', 'area-reference'),
  jialing: location('重庆合川', 29.99, 106.25, 'https://www.hc.gov.cn/xxgk/qzfwj/tjxx/tjnj/202210/W020230620389348308761.pdf', 'area-reference'),
  baiyangdian: location('白洋淀安新', 38.94, 115.99, 'https://html.rhhz.net/shhydxxb/20211003581.htm', 'area-reference'),
  jiaodong: location('威海湾', 37.50, 122.18, 'https://www.msa.gov.cn/public/documents/document/mdk1/mtey/~edisp/20170703095112360.pdf', 'area-reference'),
});

export const regionLocation = (regionId) => (
  Object.prototype.hasOwnProperty.call(REGION_LOCATIONS, regionId) ? REGION_LOCATIONS[regionId] : null
);
