// ===== 《水塘时钟》配置表（策划调参区）=====
// 全部数值集中在此：改值即生效，无需改代码。
// 设计口径：仅限中国，按现实水系/鱼群划 12 个区域；品质、收益、解锁节奏整体收紧，
// 桌面挂机下约 1~2 分钟一次咬钩，解锁新水域以"数小时"为节奏单位。

// ===== 品质档位 =====
// mult 为卖价倍率，rank 用于图鉴"最佳品质"比较
export const QUALITIES = [
  { id: "common", name: "普通", mult: 1, rank: 0, text: "text-slate-300" },
  { id: "rare", name: "稀有", mult: 2.2, rank: 1, text: "text-sky-400" },
  { id: "epic", name: "史诗", mult: 5, rank: 2, text: "text-purple-400" },
  { id: "legendary", name: "传说", mult: 12, rank: 3, text: "text-amber-400" },
];

// ===== 鱼种表 =====
// basePrice 为普通品质、中等体型的基础价（金币）
// len / wt 为游戏生成体长(cm) / 体重(kg)区间；不代表野外最大值或实测分布。
// 1.2.0 新鱼科学身份/来源在 src/data/fishSources.js；区域为宽水系鱼池，景观只是代表地标。
// qw 为该鱼种的品质权重（四档权重合计 100）
//   G 常见：89.5 / 9.3 / 1 / 0.2      A 普通：89 / 9.6 / 1.2 / 0.2
//   B 略稀有：88 / 10.4 / 1.4 / 0.2   H 掠食：88.5 / 10 / 1.3 / 0.2
//   C 名贵：87.5 / 10.2 / 1.9 / 0.4   D 稀有旗舰：86 / 12 / 1.7 / 0.3
//   E 传说旗舰：86.5 / 11 / 2.1 / 0.4 F 洄游名物：88.5 / 9.5 / 1.7 / 0.3
// 口径：普通 86-90、稀有 9-13、史诗 1-2.5、传说 0.1-0.4。
export const FISH = [
  // —— 长江中下游 / 淮河 / 黄河的广布种与四大家鱼 ——
  { id: "baitiao", name: "白条", basePrice: 2, len: [8, 18], wt: [0.02, 0.12], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: "长江下游干流与湖泊中上层" },
  { id: "jiyu", name: "鲫鱼", basePrice: 4, len: [8, 25], wt: [0.08, 0.6], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: "长江、淮河、黄河水系河湖底层" },
  { id: "bianyu", name: "鳊鱼", basePrice: 7, len: [15, 35], wt: [0.2, 1.2], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江下游湖泊中下层" },
  { id: "liyu", name: "鲤鱼", basePrice: 11, len: [25, 60], wt: [1, 6], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "黄河、长江干流与湖泊底层" },
  { id: "caoyu", name: "草鱼", basePrice: 11, len: [30, 80], wt: [1.5, 10], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中下游水草区中上层" },
  { id: "guiyu", name: "鳜鱼", basePrice: 30, len: [18, 50], wt: [0.4, 3], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "长江、珠江与黄河下游岩缝伏击" },
  { id: "lianyu", name: "鲢鱼", basePrice: 8, len: [30, 80], wt: [1.5, 8], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: "淮河、黄河干流中上层滤食" },
  { id: "yongyu", name: "鳙鱼", basePrice: 12, len: [35, 90], wt: [2, 12], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "淮河与长江中游敞水区" },
  { id: "wuliyu", name: "乌鳢", basePrice: 15, len: [20, 50], wt: [0.4, 2.5], qw: { common: 88.5, rare: 10, epic: 1.3, legendary: 0.2 }, habitat: "淮河水草区与沟渠肉食性" },
  { id: "huangsang", name: "黄颡鱼", basePrice: 8, len: [10, 22], wt: [0.05, 0.25], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "淮河与闽江底层夜行" },
  { id: "nianyu", name: "鲶鱼", basePrice: 11, len: [25, 70], wt: [1, 5], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "黄河与长江上游深潭底层" },
  { id: "qingyu", name: "青鱼", basePrice: 20, len: [40, 110], wt: [3, 20], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "长江中游深水底层" },
  { id: "qiaozuibai", name: "翘嘴鲌", basePrice: 13, len: [20, 60], wt: [0.3, 3], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "长江中游敞水中上层" },
  { id: "tuantoufang", name: "团头鲂", basePrice: 9, len: [18, 40], wt: [0.3, 1.8], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中游湖泊水草区" },

  // —— 东南沿海 / 珠江流域 / 海南岛 ——
  { id: "xiangyu", name: "香鱼", basePrice: 18, len: [12, 25], wt: [0.05, 0.2], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "闽江下游与东南沿海溪流" },
  { id: "hualu", name: "花鲈", basePrice: 22, len: [20, 60], wt: [0.4, 3.5], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "闽江河口与东南近海" },
  { id: "ziyu", name: "鲻鱼", basePrice: 9, len: [15, 45], wt: [0.2, 1.5], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "东南沿海河口咸淡水" },
  { id: "manyu", name: "鳗鲡", basePrice: 30, len: [30, 70], wt: [0.3, 2], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "闽江与东南沿海河海洄游" },
  { id: "lingyu", name: "鲮鱼", basePrice: 5, len: [12, 30], wt: [0.1, 1], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "珠江流域底层刮食" },
  { id: "huzinian", name: "胡子鲶", basePrice: 6, len: [15, 40], wt: [0.1, 1.5], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: "珠江三角洲沟渠与池塘" },
  { id: "luofeiyu", name: "罗非鱼", basePrice: 4, len: [10, 28], wt: [0.1, 1], qw: { common: 89.5, rare: 9.3, epic: 1, legendary: 0.2 }, habitat: "岭南与海南温暖水域" },
  { id: "huanmanyu", name: "花鳗鲡", basePrice: 55, len: [40, 100], wt: [1, 6], qw: { common: 88.5, rare: 9.5, epic: 1.7, legendary: 0.3 }, habitat: "海南岛河流与河口洄游" },
  { id: "daciqiu", name: "大刺鳅", basePrice: 20, len: [20, 55], wt: [0.1, 0.7], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "海南岛山溪石缝" },

  // —— 长江上游 / 云贵高原湖泊 ——
  { id: "changwenwei", name: "长吻鮠", basePrice: 30, len: [25, 60], wt: [0.5, 4], qw: { common: 86, rare: 12, epic: 1.7, legendary: 0.3 }, habitat: "长江上游岷江等深水底层" },
  { id: "yanyuanli", name: "岩原鲤", basePrice: 24, len: [20, 45], wt: [0.5, 2.5], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "长江上游峡谷岩缝" },
  { id: "zhonghuadaociba", name: "中华倒刺鲃", basePrice: 20, len: [25, 55], wt: [0.8, 4], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "长江上游急流回水沱" },
  { id: "kanglangbaiyu", name: "鱇浪白鱼", basePrice: 20, len: [8, 18], wt: [0.02, 0.1], qw: { common: 86, rare: 12, epic: 1.7, legendary: 0.3 }, habitat: "抚仙湖敞水上层" },
  { id: "daliliefuyu", name: "大理裂腹鱼", basePrice: 24, len: [15, 35], wt: [0.1, 0.8], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "洱海与滇西高原湖泊" },
  { id: "dianchijinyuba", name: "滇池金线鲃", basePrice: 26, len: [8, 18], wt: [0.02, 0.1], qw: { common: 86.5, rare: 11, epic: 2.1, legendary: 0.4 }, habitat: "滇池地下涌泉与溶洞" },

  // —— 东北 / 西北内陆河 / 青藏高原 ——
  { id: "damahayu", name: "大马哈鱼", basePrice: 28, len: [45, 90], wt: [1.5, 8], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "黑龙江与乌苏里江洄游" },
  { id: "zheluogui", name: "哲罗鲑", basePrice: 45, len: [50, 130], wt: [2, 25], qw: { common: 86.5, rare: 11, epic: 2.1, legendary: 0.4 }, habitat: "黑龙江上游冷水急流" },
  { id: "heilongjianghuiyu", name: "黑龙江茴鱼", basePrice: 22, len: [20, 45], wt: [0.1, 1], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "黑龙江上游清澈冷溪" },
  { id: "baibangouyu", name: "白斑狗鱼", basePrice: 18, len: [35, 90], wt: [0.5, 6], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "黑龙江与额尔齐斯河草滩" },
  { id: "jiangxue", name: "江鳕", basePrice: 20, len: [30, 70], wt: [0.3, 4], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "黑龙江深水底层" },
  { id: "talimuliefuyu", name: "塔里木裂腹鱼", basePrice: 24, len: [15, 35], wt: [0.1, 1], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "塔里木河与博斯腾湖" },
  { id: "xinjiangdatouyu", name: "新疆大头鱼", basePrice: 45, len: [40, 90], wt: [2, 10], qw: { common: 86.5, rare: 11, epic: 2.1, legendary: 0.4 }, habitat: "塔里木河水系深潭" },
  { id: "helu", name: "河鲈", basePrice: 20, len: [15, 35], wt: [0.15, 1], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "额尔齐斯河与伊犁河" },
  { id: "qinghailuoli", name: "青海湖裸鲤", basePrice: 26, len: [20, 45], wt: [0.2, 1.5], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "青海湖咸水湖" },
  { id: "namucuoluoli", name: "纳木错裸鲤", basePrice: 24, len: [15, 35], wt: [0.1, 0.8], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "纳木错高原咸水湖" },
  { id: "lasaliefuyu", name: "拉萨裂腹鱼", basePrice: 24, len: [20, 50], wt: [0.2, 1.8], qw: { common: 87.5, rare: 10.2, epic: 1.9, legendary: 0.4 }, habitat: "雅鲁藏布江与拉萨河" },
  { id: "gaoyuanluoli", name: "高原裸鲤", basePrice: 26, len: [18, 38], wt: [0.15, 1], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "羊卓雍错等高原湖泊" },
  { id: "xiweigaoyuanqiu", name: "细尾高原鳅", basePrice: 4, len: [6, 15], wt: [0.005, 0.04], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "青藏高原溪流石隙" },

  // —— 1.2.0 首批：水系记录可靠的八种；数值均为游戏平衡参数 ——
  { id: "guangzehuangsang", name: "光泽黄颡鱼", basePrice: 7, len: [10, 20], wt: [0.04, 0.2], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中下游干流与太湖底层；宽水系鱼池" },
  { id: "washihuangsang", name: "瓦氏黄颡鱼", basePrice: 10, len: [15, 35], wt: [0.1, 1], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中下游干流与太湖底层；宽水系鱼池" },
  { id: "hongqiyuanbai", name: "红鳍原鲌", basePrice: 11, len: [15, 40], wt: [0.15, 1.3], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "长江中下游干流与湖泊；宽水系鱼池" },
  { id: "menggubai", name: "蒙古鲌", basePrice: 14, len: [20, 55], wt: [0.3, 2.5], qw: { common: 88, rare: 10.4, epic: 1.4, legendary: 0.2 }, habitat: "长江中下游干流与湖泊；宽水系鱼池" },
  { id: "ganyu", name: "鳡", basePrice: 32, len: [35, 100], wt: [1.2, 12], qw: { common: 88.5, rare: 10, epic: 1.3, legendary: 0.2 }, habitat: "长江中下游干流敞水区；宽水系鱼池" },
  { id: "chiyanzun", name: "赤眼鳟", basePrice: 9, len: [15, 40], wt: [0.15, 1.5], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中下游江湖水域；宽水系鱼池" },
  { id: "chunhuan", name: "唇䱻", basePrice: 10, len: [18, 45], wt: [0.2, 2], qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "长江中游枝江、黄石调查江段；宽水系鱼池" },
  { id: "banli", name: "斑鳢", basePrice: 14, len: [18, 45], wt: [0.25, 2], qw: { common: 88.5, rare: 10, epic: 1.3, legendary: 0.2 }, habitat: "珠江、闽江与湘江水系野生群体记录；宽水系鱼池" },
];

// ===== 区域表 =====
// fish 为 [鱼种id, 权重]，权重越大越常见；flightPrice 为机票价（解锁后永久保留）
// tier 由低到高对应解锁顺序，机票价按 0 → 1000 → 1200 → … → 6000 递增
export const REGIONS = [
  {
    id: "jiangnan", name: "华东·长江下游", waterSystem: "长江下游干流、太湖与巢湖水系", tier: 1, flightPrice: 0,
    fish: [["baitiao", 30], ["jiyu", 32], ["bianyu", 12], ["liyu", 11], ["caoyu", 10], ["guiyu", 5], ["guangzehuangsang", 4], ["washihuangsang", 3], ["hongqiyuanbai", 3], ["menggubai", 3], ["ganyu", 1], ["chiyanzun", 4]],
  },
  {
    id: "huaihe", name: "黄淮·淮河水系", waterSystem: "淮河干流及洪泽湖、南四湖水系", tier: 2, flightPrice: 1000,
    fish: [["jiyu", 30], ["lianyu", 18], ["yongyu", 14], ["liyu", 14], ["wuliyu", 14], ["huangsang", 10]],
  },
  {
    id: "huanghe", name: "华北·黄河水系", waterSystem: "黄河中下游干流与汾河、渭河水系", tier: 3, flightPrice: 1200,
    fish: [["liyu", 32], ["jiyu", 26], ["caoyu", 16], ["lianyu", 12], ["nianyu", 8], ["guiyu", 6]],
  },
  {
    id: "changjiang", name: "华中·长江中游", waterSystem: "长江中游干流、洞庭湖与鄱阳湖水系", tier: 4, flightPrice: 1800,
    fish: [["caoyu", 20], ["yongyu", 18], ["guiyu", 14], ["qiaozuibai", 22], ["qingyu", 12], ["tuantoufang", 14], ["guangzehuangsang", 4], ["washihuangsang", 4], ["hongqiyuanbai", 4], ["menggubai", 4], ["ganyu", 1], ["chiyanzun", 4], ["chunhuan", 3], ["banli", 2]],
  },
  {
    id: "dongnan", name: "东南·闽江与东南沿海", waterSystem: "闽江干流与东南沿海河口", tier: 5, flightPrice: 2200,
    fish: [["xiangyu", 18], ["hualu", 16], ["manyu", 14], ["ziyu", 22], ["huangsang", 16], ["caoyu", 14], ["banli", 4]],
  },
  {
    id: "lingnan", name: "岭南·珠江流域", waterSystem: "珠江流域西江、北江水系与珠江三角洲", tier: 6, flightPrice: 2400,
    fish: [["guiyu", 36], ["caoyu", 16], ["yongyu", 16], ["lingyu", 14], ["huzinian", 10], ["luofeiyu", 8], ["banli", 6]],
  },
  {
    id: "xinan", name: "西南·长江上游", waterSystem: "长江上游金沙江、岷江与嘉陵江水系", tier: 7, flightPrice: 3200,
    fish: [["liyu", 22], ["caoyu", 20], ["nianyu", 16], ["changwenwei", 16], ["yanyuanli", 12], ["zhonghuadaociba", 14]],
  },
  {
    id: "yungui", name: "云贵高原湖泊", waterSystem: "滇池、洱海、抚仙湖等高原湖泊", tier: 8, flightPrice: 3600,
    fish: [["jiyu", 20], ["kanglangbaiyu", 24], ["daliliefuyu", 18], ["dianchijinyuba", 18], ["liyu", 12], ["caoyu", 8]],
  },
  {
    id: "hainan", name: "华南·海南岛", waterSystem: "南渡江、万泉河与海南岛河口", tier: 9, flightPrice: 4000,
    fish: [["huanmanyu", 18], ["daciqiu", 22], ["luofeiyu", 18], ["lingyu", 14], ["huzinian", 14], ["caoyu", 14]],
  },
  {
    id: "dongbei", name: "东北·黑龙江水系", waterSystem: "黑龙江、松花江与乌苏里江水系", tier: 10, flightPrice: 5200,
    fish: [["damahayu", 20], ["baibangouyu", 22], ["zheluogui", 8], ["heilongjianghuiyu", 14], ["jiangxue", 14], ["jiyu", 22]],
  },
  {
    id: "xibei", name: "西北·内陆河水系", waterSystem: "塔里木河、伊犁河与额尔齐斯河水系", tier: 11, flightPrice: 5600,
    fish: [["talimuliefuyu", 26], ["helu", 20], ["baibangouyu", 16], ["jiyu", 14], ["liyu", 12], ["xinjiangdatouyu", 12]],
  },
  {
    id: "qingzang", name: "青藏高原湖泊", waterSystem: "青海湖、纳木错、羊卓雍错与雅鲁藏布江水系", tier: 12, flightPrice: 6000,
    fish: [["qinghailuoli", 26], ["lasaliefuyu", 22], ["gaoyuanluoli", 18], ["namucuoluoli", 16], ["xiweigaoyuanqiu", 18]],
  },
];

// 初始（本地）水域
export const DEFAULT_REGION = "jiangnan";

// ===== 鱼竿档位 =====
// intervalMult 越小咬钩越快；windowBonus 加判定窗口；qualityBonus 提升稀有权重
export const RODS = [
  { name: "竹竿", cost: 0, windowBonus: 0, intervalMult: 1, qualityBonus: 0 },
  { name: "玻璃钢竿", cost: 600, windowBonus: 5, intervalMult: 0.85, qualityBonus: 3 },
  { name: "碳素竿", cost: 2600, windowBonus: 10, intervalMult: 0.72, qualityBonus: 6 },
  { name: "大师手工竿", cost: 9000, windowBonus: 15, intervalMult: 0.6, qualityBonus: 10 },
];

// ===== 鱼饵 =====
export const BAIT_COST = 120;          // 鱼饵单价
export const BAIT_CATCHES = 5;         // 每份鱼饵可用次数
export const BAIT_QUALITY_BONUS = 6;   // 鱼饵品质权重加成

// ===== 咬钩节奏 =====
// 桌面挂机：约 1~2 分钟一次咬钩（随鱼竿 intervalMult 缩短）
export const BITE = { minSeconds: 55, maxSeconds: 125 };

// ===== 判定窗口 =====
// 默认仅倒计时；bestClickStart/bestClickEnd/qualityBonusBest 为后续"张力判定"预留。
// qualityBonusBest = 0 表示默认关闭（策划调参改为正数即启用最佳点击区间加成）。
export const JUDGE = {
  windowSeconds: 20,    // 判定窗口 20 秒
  bestClickStart: 3,    // 预留：最佳点击区间起点
  bestClickEnd: 10,     // 预留：最佳点击区间终点
  qualityBonusBest: 0,  // 预留：最佳区间点击的品质加成（0 = 默认关闭）
};

// 距上次高品质达到 N 条后触发保底加成（rollFish 中放大史诗/传说权重）
export const PITY_THRESHOLD = 30;

// ===== 省份 → 区域映射 =====
// 覆盖中国全部 34 个省级行政区，提供中文全称、简称与英文拼音键。
// regionForProvince 会先做后缀归一（省/市/自治区/特别行政区），再做包含匹配。
export const PROVINCE_TO_REGION = {
  // 华东·长江下游（默认本地水域）
  "上海": "jiangnan", "上海市": "jiangnan", "shanghai": "jiangnan",
  "江苏": "jiangnan", "江苏省": "jiangnan", "jiangsu": "jiangnan",
  "浙江": "jiangnan", "浙江省": "jiangnan", "zhejiang": "jiangnan",

  // 黄淮·淮河水系
  "安徽": "huaihe", "安徽省": "huaihe", "anhui": "huaihe",
  "河南": "huaihe", "河南省": "huaihe", "henan": "huaihe",

  // 华北·黄河水系
  "北京": "huanghe", "北京市": "huanghe", "beijing": "huanghe",
  "天津": "huanghe", "天津市": "huanghe", "tianjin": "huanghe",
  "河北": "huanghe", "河北省": "huanghe", "hebei": "huanghe",
  "山西": "huanghe", "山西省": "huanghe", "shanxi": "huanghe",
  "内蒙古": "huanghe", "内蒙古自治区": "huanghe", "内蒙": "huanghe", "neimenggu": "huanghe", "neimeng": "huanghe", "innermongolia": "huanghe",
  "山东": "huanghe", "山东省": "huanghe", "shandong": "huanghe",
  "陕西": "huanghe", "陕西省": "huanghe", "shaanxi": "huanghe",
  "宁夏": "huanghe", "宁夏回族自治区": "huanghe", "ningxia": "huanghe",

  // 华中·长江中游
  "江西": "changjiang", "江西省": "changjiang", "jiangxi": "changjiang",
  "湖北": "changjiang", "湖北省": "changjiang", "hubei": "changjiang",
  "湖南": "changjiang", "湖南省": "changjiang", "hunan": "changjiang",

  // 东南·闽江与东南沿海
  "福建": "dongnan", "福建省": "dongnan", "fujian": "dongnan",
  "台湾": "dongnan", "台湾省": "dongnan", "taiwan": "dongnan",

  // 岭南·珠江流域
  "广东": "lingnan", "广东省": "lingnan", "guangdong": "lingnan",
  "广西": "lingnan", "广西壮族自治区": "lingnan", "guangxi": "lingnan",
  "香港": "lingnan", "香港特别行政区": "lingnan", "hongkong": "lingnan", "xianggang": "lingnan",
  "澳门": "lingnan", "澳门特别行政区": "lingnan", "macau": "lingnan", "macao": "lingnan", "aomen": "lingnan",

  // 西南·长江上游
  "重庆": "xinan", "重庆市": "xinan", "chongqing": "xinan",
  "四川": "xinan", "四川省": "xinan", "sichuan": "xinan",

  // 云贵高原湖泊
  "贵州": "yungui", "贵州省": "yungui", "guizhou": "yungui",
  "云南": "yungui", "云南省": "yungui", "yunnan": "yungui",

  // 华南·海南岛
  "海南": "hainan", "海南省": "hainan", "hainan": "hainan",

  // 东北·黑龙江水系
  "辽宁": "dongbei", "辽宁省": "dongbei", "liaoning": "dongbei",
  "吉林": "dongbei", "吉林省": "dongbei", "jilin": "dongbei",
  "黑龙江": "dongbei", "黑龙江省": "dongbei", "heilongjiang": "dongbei",

  // 西北·内陆河水系
  "甘肃": "xibei", "甘肃省": "xibei", "gansu": "xibei",
  "新疆": "xibei", "新疆维吾尔自治区": "xibei", "xinjiang": "xibei",

  // 青藏高原湖泊
  "西藏": "qingzang", "西藏自治区": "qingzang", "xizang": "qingzang", "tibet": "qingzang",
  "青海": "qingzang", "青海省": "qingzang", "qinghai": "qingzang",

  // ISO 3166-2:CN 省码（ipapi 等定位服务可能只返回两位省码，统一映射到对应水域）
  "bj": "huanghe", "tj": "huanghe", "he": "huanghe", "sx": "huanghe", "nm": "huanghe",
  "sd": "huanghe", "sn": "huanghe", "nx": "huanghe",
  "ah": "huaihe", "ha": "huaihe",
  "sh": "jiangnan", "js": "jiangnan", "zj": "jiangnan",
  "jx": "changjiang", "hb": "changjiang", "hn": "changjiang",
  "fj": "dongnan", "tw": "dongnan",
  "gd": "lingnan", "gx": "lingnan", "hk": "lingnan", "mo": "lingnan",
  "cq": "xinan", "sc": "xinan",
  "gz": "yungui", "yn": "yungui",
  "hi": "hainan",
  "ln": "dongbei", "jl": "dongbei", "hl": "dongbei",
  "gs": "xibei", "xj": "xibei",
  "xz": "qingzang", "qh": "qingzang",
};
