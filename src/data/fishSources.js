// Scientific/distribution evidence is separate from game prices, size ranges and catch weights.
// Source A/B/C describes the supplied catalogue; R1 describes regional research evidence.
export const FISH_SOURCE_SNAPSHOT = Object.freeze({
  catalogueDate: "2026-10-22",
  catalogueVersion: "FishBase v25.04 (2025-04)",
  sha256: "21b81697c65c5564b301ed70768c57181a9b402ac7bcec1d9cb386771774d46d",
  approvedBaseline: "a270e84",
  implementedDate: "2026-10-25",
  poolScope: "宽水系鱼池；景观地标不等于逐种采样点",
  v2ExpansionDate: '2026-10-27',
  v2ExpansionScope: '五新水域与六新鱼；三淡水补充的竿钓细节属游戏演绎，未声称一手钩钓证据已核实',
});

export const FISH_REFERENCES = Object.freeze({
  R01: Object.freeze({
    title: "王召根等(2021)：长江镇江和畅洲水域鱼类群落组成及环境影响因子",
    url: "https://www.casb.org.cn/CN/Y2021/V37/I30/139",
    type: "original-research", locator: "表1", surveyedAt: "2016-11—2017-10",
    scope: "长江镇江和畅洲；非秦淮文德桥定点调查",
  }),
  R02: Object.freeze({
    title: "2018—2020年太湖鱼类调查附录1",
    url: "https://www.ere.ac.cn/attached/file/20210517/20210517100746_819.pdf",
    type: "original-research-supplement", locator: "第1—2页", surveyedAt: "2018—2020",
    scope: "太湖各湖区；非秦淮文德桥定点调查",
  }),
  R03: Object.freeze({
    title: "长江中游鱼类调查，DOI 10.3724/1000-3207.2026.2025.0287",
    url: "https://castjournals.cast.org.cn/joweb/ssswxb/CN/1259824983409288067",
    type: "original-research", locator: "表1", surveyedAt: "2022—2024",
    scope: "枝江、监利、岳阳、黄石调查江段；非武汉晴川阁定点调查",
  }),
  R04: Object.freeze({
    title: "上官清等(2020)：斑鳢基因组中微卫星分布特征及野生种群遗传结构分析",
    url: "https://www.schinafish.cn/article/doi/10.12131/20190200",
    type: "original-research", locator: "表1：野生群体采集水系", surveyedAt: "2020年发表",
    scope: "珠江河口/邕江、闽江邵武、湘江江华；表中广州地名与坐标关系有疑点，不复用坐标或声称沙面定点",
  }),
  R05: Object.freeze({
    title: '王银肖等(2022)：白洋淀鱼类群落结构与环境因子关系分析',
    url: 'https://html.rhhz.net/shhydxxb/20211003581.htm',
    type: 'original-research', locator: '表1与2.1节', surveyedAt: '2019—2020',
    scope: '白洋淀30位点；生态调查，不等于竿钓记录或实时丰度',
  }),
  R06: Object.freeze({
    title: '雄安新区：野生鱼类增加至50种',
    url: 'https://www.xiongan.gov.cn/20250822/40a8355ed1754cbfb90380142e2ad214/c.html',
    type: 'official-regional-monitoring', locator: '花䱻恢复记录', surveyedAt: '2024—2025记录，2025发表',
    scope: '白洋淀恢复／跟踪记录，不推断安新机位逐种可钓',
  }),
  R07: Object.freeze({
    title: '威海市海洋游钓基地布局规划（2012—2020）',
    url: 'https://hyyy.weihai.gov.cn/module/download/downfile.jsp?classid=0&filename=1807060947296624924.pdf',
    type: 'official-historical-angling-catalogue', locator: '主要游钓鱼类表', surveyedAt: '2012—2020历史规划',
    scope: '威海宽海域对象鱼，不作为刘公岛机位调查、当前丰度或现行许可',
  }),
  R08: Object.freeze({
    title: '太湖麦穗鱼生长、死亡和利用状况评估',
    url: 'https://xuebao.dlou.edu.cn/article/2016/2095-1388/201604006.html',
    type: 'original-research', locator: '摘要与采样方法', surveyedAt: '2014年，2016发表',
    scope: '太湖虾笼网采样，不据此宣称普通竿钓已证实',
  }),
});

const yangtzeEvidence = [
  { regionId: "jiangnan", references: ["R01", "R02"], waterSystem: "长江下游镇江与太湖" },
  { regionId: "changjiang", references: ["R03"], waterSystem: "长江中游调查江段" },
];

function entry(scientificName, sourceFid, catalogueClass, references, regionEvidence, balanceReason, aliases = [], extra = {}) {
  return Object.freeze({
    scientificName, sourceFids: Object.freeze(sourceFid ? [sourceFid] : []), catalogueClass,
    references: Object.freeze(references), sourceUrls: Object.freeze(references.map((id) => FISH_REFERENCES[id].url)),
    evidenceTier: "R1", evidenceType: "水系原始研究记录", aliases: Object.freeze(aliases),
    regionEvidence: Object.freeze(regionEvidence.map((evidence) => Object.freeze({
      ...evidence, references: Object.freeze([...evidence.references]),
    }))),
    exactLandmarkVerified: false,
    anglingEvidence: catalogueClass === "C" ? "区域补充；未独立确认普通竿钓" : "数据库游钓标签；具体普通竿钓方式未独立确认",
    parameterBasis: "价格、len/wt、品质与投放权重均为游戏平衡参数，不是野外最大值/丰度测量",
    balanceReason,
    ...extra,
  });
}

export const FISH_SOURCES = Object.freeze({
  guangzehuangsang: entry("Tachysurus nitidus", "F2690", "C", ["R01", "R02", "R03"], yangtzeEvidence,
    "小型底层鱼；基础7略低于旧黄颡鱼8，普通品质占主导", ["Pelteobagrus nitidus"]),
  washihuangsang: entry("Tachysurus vachellii", "F2691", "C", ["R01", "R02", "R03"], yangtzeEvidence,
    "与旧黄颡鱼分种，体型档稍大；基础10，仍按普通鱼品质组", ["Pelteobagrus vachellii", "Pelteobagrus vachelli"]),
  hongqiyuanbai: entry("Chanodichthys erythropterus", "F2694", "C", ["R01", "R02", "R03"], yangtzeEvidence,
    "中型鲌类基础11，低于旧翘嘴鲌13；沿用略稀有品质组", ["Cultrichthys erythropterus"]),
  menggubai: entry("Chanodichthys mongolicus", "F2695", "C", ["R01", "R02", "R03"], yangtzeEvidence,
    "中型掠食档基础14，接近翘嘴鲌13；不设置专属稀有加成", ["Culter mongolicus"]),
  ganyu: entry("Elopichthys bambusa", "F2697", "C", ["R01", "R03"], [
    { regionId: "jiangnan", references: ["R01"], waterSystem: "长江下游镇江和畅洲" },
    yangtzeEvidence[1],
  ], "大型掠食档基础32、低投放权重1；品质仍用普通掠食组，不让大体型自动变成高品质"),
  chiyanzun: entry("Squaliobarbus curriculus", "F2700", "C", ["R01", "R03"], [
    { regionId: "jiangnan", references: ["R01"], waterSystem: "长江下游镇江和畅洲" },
    yangtzeEvidence[1],
  ], "基础9补足中价杂食档；名字带鳟不套冷水鲑鳟高价"),
  chunhuan: entry("Hemibarbus labeo", "F0616", "A", ["R03"], [
    { regionId: "changjiang", references: ["R03"], waterSystem: "枝江2022—2024及黄石2022有样本" },
  ], "中型底层档基础10，投放权重3；不将名录M16类群推定当作微物体型事实"),
  banli: entry("Channa maculata", "F0296", "A", ["R04"], [
    { regionId: "lingnan", references: ["R04"], waterSystem: "珠江河口及邕江野生群体" },
    { regionId: "dongnan", references: ["R04"], waterSystem: "闽江邵武野生群体" },
    { regionId: "changjiang", references: ["R04"], waterSystem: "洞庭湖水系湘江江华野生群体" },
  ], "与乌鳢分种，基础14接近旧乌鳢15；少量进入长江中游，闽江/珠江适度补充掠食档"),
  maisui: entry('Pseudorasbora parva', null, 'regional-supplement', ['R02', 'R05', 'R08'], [
    { regionId: 'taihu', references: ['R02', 'R08'], waterSystem: '太湖湖区' },
    { regionId: 'baiyangdian', references: ['R05'], waterSystem: '白洋淀湖群' },
  ], '小型鱼采用低基础价与常见品质组，物种常见与品质独立', [], {
    anglingEvidence: '已核区域生态采样；一手竿钓证据未独立核实，本游戏钩获为演绎', addedVersion: '2.0.0',
  }),
  huahuan: entry('Hemibarbus maculatus', null, 'regional-supplement', ['R02', 'R06'], [
    { regionId: 'taihu', references: ['R02'], waterSystem: '太湖湖区' },
    { regionId: 'baiyangdian', references: ['R06'], waterSystem: '白洋淀湖群' },
  ], '花䱻与唇䱻保留独立身份；基础价与体型为游戏参数', [], {
    anglingEvidence: '已核区域生态／恢复记录；一手竿钓证据未独立核实，本游戏钩获为演绎', addedVersion: '2.0.0',
  }),
  hechuanshatangli: entry('Odontobutis potamophila', null, 'regional-supplement', ['R02'], [
    { regionId: 'taihu', references: ['R02'], waterSystem: '太湖湖区' },
  ], '底层小型掠食鱼，不因名称或生态自动赋高品质', ['Odontobutis potamophilus'], {
    anglingEvidence: '已核太湖生态记录；一手竿钓证据未独立核实，本游戏钩获为演绎', addedVersion: '2.0.0',
  }),
  xushipingyou: entry('Sebastes schlegelii', 'F1360', 'A', ['R07'], [
    { regionId: 'jiaodong', references: ['R07'], waterSystem: '威海近岸海域' },
  ], '礁栖鱼与淡水鱼分池，品质仍独立抽取', [], {
    evidenceTier: 'R2', anglingEvidence: '用户名录A类与官方历史游钓对象表；不是当前地标许可', addedVersion: '2.0.0',
  }),
  dalongliuxian: entry('Hexagrammos otakii', 'F0657', 'A', ['R07'], [
    { regionId: 'jiaodong', references: ['R07'], waterSystem: '威海近岸海域' },
  ], '近岸岩礁对象鱼，使用中档基础价和普通品质组', [], {
    evidenceTier: 'R2', anglingEvidence: '用户名录A类与官方历史游钓对象表；不是当前地标许可', addedVersion: '2.0.0',
  }),
  heidiao: entry('Acanthopagrus schlegelii', 'F1411', 'A', ['R07'], [
    { regionId: 'jiaodong', references: ['R07'], waterSystem: '威海近岸海域' },
  ], '以学名去重，不按旧属名拆成新鱼；地域与品质分别处理', ['Acanthopagrus schlegeli'], {
    evidenceTier: 'R2', anglingEvidence: '用户名录A类与官方历史游钓对象表；不是当前地标许可', addedVersion: '2.0.0',
  }),
});
