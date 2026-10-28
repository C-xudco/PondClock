// Weather sampling locations are independent of airport/fare coordinates.
// Published camera GPS and official area bounds are reference weather points,
// not surveyed fishing spots or assertions of station-level weather accuracy.
const checkedOn = "2026-10-25";
const commons = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
const definitions = [
  ["jiangnan", "qinhuai-wende", "秦淮河·文德桥", "江苏省南京市秦淮区夫子庙文德桥", 32.021340, 118.784115,
    commons("南京夫子庙文德桥 - panoramio.jpg"), "published-camera-gps"],
  ["huaihe", "tushan-huaihe", "淮河·涂山", "安徽省蚌埠市涂山—白乳泉景区淮河段", 32.94, 117.20,
    "https://www.ahhy.gov.cn/group6/M00/1B/4E/wKgQBWdrvT-ANF38AQogV6ozCwo740.pdf", "published-area-reference"],
  ["huanghe", "huayuankou", "黄河·花园口", "河南省郑州市惠济区花园口黄河南岸", 34 + 54 / 60 + 21 / 3600, 113 + 41 / 60 + 31 / 3600,
    "https://www.mee.gov.cn/ywdt/gs/wqgs_1/201906/W020190614338988978485.pdf", "published-water-survey"],
  ["changjiang", "hanyang-qingchuan", "长江·晴川江岸", "湖北省武汉市汉阳区晴川阁附近江岸", 30.558542, 114.279519,
    commons("Qingchuan Pavilion, Hubei, China.jpg"), "published-camera-gps"],
  ["dongnan", "wulong-jinshan", "乌龙江·金山寺", "福建省福州市仓山区洪塘金山寺水域", 26.075611, 119.226289,
    "https://commons.wikimedia.org/wiki/Category:Jinshan_Temple,_Fuzhou", "published-geotag"],
  ["lingnan", "zhujiang-shamian", "珠江·沙面", "广东省广州市荔湾区沙面南岸白鹅潭畔", 23.109233, 113.235039,
    commons("Consulate General of the United States Shameen Canton.JPG"), "published-camera-gps"],
  ["xinan", "qutang-kuimen", "长江·夔门", "重庆市奉节县瞿塘峡夔门水域", 31.029919, 109.601408,
    commons("长江三峡 夔门 - panoramio.jpg"), "published-camera-gps"],
  ["yungui", "erhai-xiaoputuo", "洱海·小普陀东岸", "云南省大理市挖色镇小普陀附近湖岸", 25.810038, 100.222901,
    commons("小普陀 1.jpg"), "published-camera-gps"],
  ["hainan", "boao-wanquan", "万泉河·博鳌河口", "海南省琼海市博鳌镇东屿岛玉带滩内侧", 19.148348, 110.585184,
    commons("博鳌 东屿岛 玉带滩 2014春节 liuzusai - panoramio (23).jpg"), "published-camera-gps"],
  ["dongbei", "heilongjiang-beijicun", "黑龙江·北极村", "黑龙江省漠河市北极镇北极村黑龙江南岸", 53.48, 122.355,
    "https://mohe.gov.cn/mohe/c101210/202309/c13_258538.shtml", "published-area-reference"],
  ["xibei", "tarim-lunnan", "塔里木河·胡杨岸", "新疆轮台县轮南镇塔里木河胡杨河段", 41.20, 84.30,
    "https://www.fnrrc.com/ziranbaohuqujianjie/10369.html", "published-area-reference"],
  ["qingzang", "namtso-tashi", "纳木错·扎西半岛", "西藏自治区拉萨市当雄县纳木错扎西半岛湖岸", 30.776327, 90.871296,
    commons("纳木错 - panoramio (1).jpg"), "published-camera-gps"],
  ['taihu', 'taihu-yuantouzhu', '太湖·鼋头渚', '江苏省无锡市滨湖区鼋头渚景区湖岸', 31 + 31 / 60 + 30 / 3600, 120 + 12 / 60 + 52 / 3600,
    'https://en.ytz.com.cn/dlwz.html', 'published-area-reference'],
  ['dongting', 'dongting-junshan', '洞庭湖·君山', '湖南省岳阳市君山区洞庭湖湖区', 29.38, 113.10,
    'https://junshan.gov.cn/32415/32465/39375/39381/content_1193499.html', 'selected-area-reference'],
  ['jialing', 'jialing-hechuan', '嘉陵江·合川汇流', '重庆市合川区嘉陵江三江汇流河段意象', 29.99, 106.25,
    'https://www.hc.gov.cn/xxgk/qzfwj/tjxx/tjnj/202210/W020230620389348308761.pdf', 'selected-area-reference'],
  ['baiyangdian', 'baiyangdian-anxin', '白洋淀·芦苇水巷', '河北省雄安新区安新县白洋淀湖区', 38.94, 115.99,
    'https://html.rhhz.net/shhydxxb/20211003581.htm', 'selected-area-reference'],
  ['jiaodong', 'weihai-liugong', '威海湾·刘公岛', '山东省威海市威海湾刘公岛远眺意象', 37.50, 122.18,
    'https://www.msa.gov.cn/public/documents/document/mdk1/mtey/~edisp/20170703095112360.pdf', 'selected-area-reference'],
];

export const SCENE_SITES = Object.freeze(Object.fromEntries(definitions.map(([regionId, slug, place, address, latitude, longitude, url, kind]) => [
  regionId, Object.freeze({ siteId: slug, sceneId: `ink-${regionId}`, regionId, siteRevision: 1,
    place, address, timeZone: "Asia/Shanghai", verification: kind === 'selected-area-reference' ? 'area-reference' : 'verified',
    weatherLocation: Object.freeze({ latitude, longitude }),
    coordinateSource: Object.freeze({ url, checkedOn: ['taihu', 'dongting', 'jialing', 'baiyangdian', 'jiaodong'].includes(regionId) ? '2026-10-27' : checkedOn, kind,
      precision: kind.includes('area-reference') ? "area-reference" : "published-reference-point" }),
    weatherReferenceLabel: kind.includes('area-reference') ? "景区范围参考天气" : "景点参考天气",
  }),
])));

export const sceneSiteForRegion = (regionId) => SCENE_SITES[regionId] || SCENE_SITES.jiangnan;
