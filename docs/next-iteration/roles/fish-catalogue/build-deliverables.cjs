// Documentation-only: regenerate CSV and machine-readable audit from the fixed source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {summary,records} = require('./analyse-catalogue.cjs');
const root = path.resolve(__dirname,'../../../..');
const configPath = path.join(root,'src/lib/gameConfig.js');
const artPath = path.join(root,'docs/inkwash/roles/art-direction/README.md');
// Historical planning export stays pinned to the approved 1.1.1 baseline after new fish ship.
const baselineRevision='a270e84';
const baselineConfig=execFileSync('git',['show',`${baselineRevision}:src/lib/gameConfig.js`],{cwd:root,encoding:'utf8'});
async function buildHistoricalSnapshot(){
// Preserve complete nested fish arrays by importing the actual ESM constants.
const {FISH: runtimeFish, REGIONS: runtimeRegions} = await import(`data:text/javascript;base64,${Buffer.from(baselineConfig).toString('base64')}`);
const fish = runtimeFish.map(({id,name,habitat})=>({id,name,habitat}));
const regions = runtimeRegions.map(({id,name,waterSystem,fish})=>({id,name,waterSystem,fish:fish.map(([fishId])=>fishId)}));
const sources = {
 R01:{title:'王召根等(2021)：长江镇江和畅洲水域鱼类群落组成及环境影响因子',url:'https://www.casb.org.cn/CN/Y2021/V37/I30/139',type:'original_research',access:'正文及表1已读',timeScope:'2016-11—2017-10',locator:'表1：物种组成；79种周年调查',scope:'长江镇江和畅洲；不是南京秦淮文德桥'},
 R02:{title:'2018—2020年太湖各湖区鱼种组成（原始论文附录1）',url:'https://www.ere.ac.cn/attached/file/20210517/20210517100746_819.pdf',type:'original_research_supplement',access:'3页PDF文本已读',timeScope:'2018—2020',locator:'第1页红鳍原鲌/蒙古鲌；第2页光泽/瓦氏黄颡鱼',scope:'太湖七湖区；不是秦淮河'},
 R03:{title:'水生生物学报：长江中游鱼类调查，DOI 10.3724/1000-3207.2026.2025.0287',url:'https://castjournals.cast.org.cn/joweb/ssswxb/CN/1259824983409288067',type:'original_research',access:'原文表1与调查年份已读；唇䱻行另经原站检索返回核对',timeScope:'2022—2024；2026-05出版',locator:'表1：枝江/监利/岳阳/黄石；唇䱻在枝江2022—2024及黄石2022有样本',scope:'长江中游四调查江段；不是武汉晴川阁'},
 R04:{title:'上官清等(2020)：斑鳢基因组中微卫星分布特征及野生种群遗传结构分析',url:'https://www.schinafish.cn/article/doi/10.12131/20190200',type:'original_research',access:'原站搜索返回表1可读；直接打开超时/缓存缺失，未记全文通读',timeScope:'2020年发表',locator:'表1：广州群体为珠江河口，南宁为邕江，邵武为闽江',scope:'只取标明水系的野生群体；表中广州坐标与名称关系存在疑点，不复用坐标'},
 R05:{title:'新疆农业农村厅(2023)：额尔齐斯河流域打响“绿色水产”品牌',url:'https://nynct.xinjiang.gov.cn/xjnynct/c113577/202309/f521eae462144ca2a13fd3fc2919370e.shtml',type:'official_basin_material',access:'正文已读',timeScope:'2023-09-11',locator:'水产繁育基地段列丁鱥为额尔齐斯河土著鱼',scope:'额尔齐斯河；不能外推塔里木或轮南镇'},
 R06:{title:'黑龙江农业农村厅：2025年水生生物增殖放流项目实施方案附件',url:'https://nynct.hlj.gov.cn/nynct/c115422/202504/31833743/files/关于印发《黑龙江省2025年水生生物增殖放流项目实施方案》的通知（附件）.pdf',type:'official_water_system_suitability',access:'9页PDF已读相关表；不是现场调查',timeScope:'2025',locator:'附件3，第7页：黑龙江/乌苏里江/松花江适宜物种均含黑斑狗鱼',scope:'证明官方水系适配，不证明北极村当下种群丰度或定点钓获'},
 R07:{title:'兴化湾和闽江口海域春夏季鱼类区系特征',url:'https://www.biodiversity-science.net/CN/10.3724/SP.J.1003.2011.06113',type:'original_research',access:'原站搜索返回摘要及物种表；直接网页403，未完成通读',timeScope:'2008年春夏采样；2011年发表',locator:'物种表黄鳍鲷Sparus latus、黑棘鲷Acanthopagrus schlegeli；比较两海区',scope:'东南沿海研究覆盖闽江口/兴化湾；本轮不按搜索片段的不明列界断言精确子海区与季节，不能外推乌龙江金山寺'},
 R08:{title:'福建省发展改革委(2025)：共绘江河湖海生生不息壮美画卷',url:'https://fgw.fujian.gov.cn/ztzl/hxlsjjsyqzt/lsdt/202506/t20250606_6922522.htm',type:'official_monitoring_report',access:'正文已读，作为黄鳍鲷区域旁证',timeScope:'页面时间2025-06-05',locator:'闽江口放流评估的黄鳍鲷渔获记录',scope:'只作闽江口存在及放流背景，不替代野生自然分布核实'},
 R09:{title:'白敬沛等(2020)：丹江口水库鱼类群落特征及其历史变化',url:'https://www.biodiversity-science.net/attached/file/20210108/20210108143710_756.pdf',type:'original_research_historical_only',access:'原站搜索可读正文及附录片段；直接访问403',timeScope:'2018—2019调查并与1950/1980年代比较',locator:'正文3.3：宽鳍鱲和马口鱼是历史记录，本次未采到',scope:'历史存在不能转写为当前常见；不作武汉或秦淮定点证据'}
};
// Tuple: source F id, display name, region evidence tier, supported region ids,
// potential ids (unverified), reference ids, bounded evidence, proposal status.
const selected = [
 ['F2690','光泽黄颡鱼','R1','jiangnan|changjiang','','R01|R02|R03','镇江和畅洲表1、太湖附录及中游四江段调查有记录；仅支持区域大池。','优先候选-待用户审核'],
 ['F2691','瓦氏黄颡鱼','R1','jiangnan|changjiang','','R01|R02|R03','镇江和畅洲/太湖及长江中游调查有记录；不是现有黄颡鱼的别名。','优先候选-待用户审核'],
 ['F2694','红鳍原鲌','R1','jiangnan|changjiang','','R01|R02|R03','镇江和畅洲及太湖原始调查收录；长江中游表1亦有记录；论文旧属名Cultrichthys。','优先候选-待用户审核'],
 ['F2695','蒙古鲌','R1','jiangnan|changjiang','','R01|R02|R03','镇江/太湖及长江中游原始表记录；Culter mongolicus与快照Chanodichthys作旧属名对照。','优先候选-待用户审核'],
 ['F2697','鳡','R1','jiangnan|changjiang','','R01|R03','镇江和畅洲与长江中游原始调查表收录Elopichthys bambusa；不由全国分布推得。','优先候选-待用户审核'],
 ['F2700','赤眼鳟','R1','jiangnan|changjiang','','R01|R03','镇江和畅洲表1、长江中游表1收录；不是鲑鳟类。','优先候选-待用户审核'],
 ['F0616','唇䱻','R1','changjiang','','R03','长江中游表1枝江2022—2024、黄石2022有样本；与花䱻Hemibarbus maculatus分种。','优先候选-待用户审核'],
 ['F0296','斑鳢','R1','lingnan|dongnan|changjiang','','R04','野生群体表1明确珠江河口/邕江、闽江邵武、湘江江华；不证明广州沙面、金山寺或武汉点位。','优先候选-待用户审核'],
 ['F0577','黑斑狗鱼','R2','dongbei','','R06','官方附件3把黑斑狗鱼列为黑龙江、乌苏里江、松花江适宜物种；这不是样本调查；与现有白斑狗鱼不同种。','区域候选-待用户审核及定点核实'],
 ['F1512','丁鱥','R2','xibei','','R05','新疆官方额尔齐斯河材料明确列土著丁鱥；只支持现有西北大区的额河子水系，轮南塔里木场景不适配。','条件候选-不得投轮南场景'],
 ['F1410','黄鳍鲷','R1','dongnan','','R07|R08','闽江口海域原始调查列旧名Sparus latus，并有官方放流评估旁证；金山寺河段盐度及出现待核。','河口候选-待用户审核及盐度核实'],
 ['F1411','黑鲷','R1','dongnan','','R07','闽江口/兴化湾比较研究物种表列黑棘鲷Acanthopagrus schlegeli；另列Sparus macrocephalus旧名不能拆两种；只确认东南沿海大区，具体子海区/季节及乌龙江待核。','河口候选-待用户审核及异名核实'],
 ['F2699','马口鱼','R3','','jiangnan|changjiang|dongnan','R09','仅核到丹江口历史记录且2018—2019未采到；溪流性也不等于秦淮/武汉/金山寺敞水有现存群体。','待核-补当前子水系记录'],
 ['F2701','宽鳍鱲','R3','','jiangnan|changjiang|dongnan','R09','快照Zacco platypus保留原样；丹江口仅历史记录且本次未采到；大陆鱲类分类及当地有效名未解决。','暂缓-分类与现存分布待核'],
 ['F0806','拟鲤','R3','','xibei','','快照示例仅中国大陆；额尔齐斯河湖拟鲤的名称与Rutilus rutilus及后续分类须核对，未用俗名直接归并。','待核-不得投塔里木场景'],
 ['F0738','尖吻鲈','R3','','hainan|lingnan','','快照有逐种竿钓资料，但未核到万泉河博鳌或珠江沙面野生分布；养殖记录不能替代。','待核-补河口原始记录'],
 ['F0923','大鳞鮻','R3','','hainan|dongnan','','快照支持河口生态和中国示例；尚无万泉河或闽江水系直接证据；不是现有鲻Mugil cephalus别名。','待核-补水系和鉴别'],
 ['F0840','紫红笛鲷','R3','','hainan','','快照H05含河口幼鱼生态，成鱼可能转海域；未核博鳌现存及生活史阶段，不扩珊瑚礁或外海场景。','暂缓-河口阶段与分布待核'],
 ['F2632','黄鳝','R3','','jiangnan|huaihe|lingnan','','B类仅数据库钩线字段，微生境偏沟渠湿地；未核当前三地标/子水系，也未独立确认普通竿钓。','待核-分布与竿钓均待核'],
 ['F2641','花身鯻（细鳞鯻）','R3','','hainan|dongnan','','B类钩线字段不等普通竿钓；仅中国及H05生态线索，万泉河/闽江的逐种记录未核。','待核-分布与竿钓均待核'],
];
const mapped = {baitiao:'F1551',jiyu:'F0384',liyu:'F0391',caoyu:'F1550',guiyu:'F2693',lianyu:'F1552',yongyu:'F1553',wuliyu:'F0295',huangsang:'F2689',nianyu:'F1398',qingyu:'F2686',qiaozuibai:'F2696',tuantoufang:'F2698',xiangyu:'F1051',ziyu:'F0919',manyu:'F1574',huanmanyu:'F0045',daciqiu:'F0887',damahayu:'F1157',zheluogui:'F1152',baibangouyu:'F0574',jiangxue:'F0824',helu:'F1022'};
const notes = {
 baitiao:'意向按䱗Hemiculter leucisculus对照；禁止用白条子串匹配海鱼。', jiyu:'意向鲫Carassius auratus；金鱼地方型不新增；银鲫/日本白鲫不先拆。', bianyu:'鳊与团头鲂需分种；名录未收Parabramis pekinensis，不能据此删现有鱼。', hualu:'需确认中国花鲈Lateolabrax maculatus意向；F0735为L.japonicus，不直接合并；L.latus亦非别名。', huangsang:'只按T.fulvidraco意向；光泽和瓦氏不是中文子串别名。', nianyu:'意向土鲇Silurus asotus，不能覆盖南方鲇等全部鲇。', manyu:'意向日本鳗鲡Anguilla japonica，花鳗鲡另有现有ID；不按鳗鲡子串全匹配。', lingyu:'未见快照Cirrhinus molitorella；缺记录不是生态否定。', huzinian:'需确认Clarias fuscus；不把尖齿胡鲶F0345或斑纹胡鲶F0344当别名。', luofeiyu:'集合俗名，未定单种；不能把莫桑比克/奥利亚口孵非鲫当同一种新增。', zheluogui:'意向太门哲罗鲑Hucho taimen；不是欧洲哲罗鲑H.hucho。', heilongjianghuiyu:'未定Thymallus有效名；不把北极茴鱼F1184直接替换。', baibangouyu:'F0574是Esox lucius；F0577黑斑狗鱼为另一种，黑龙江现有白斑分布要另核。', helu:'F1022为Perca fluviatilis；现有文字称伊犁河也有，本轮未核实。', xinjiangdatouyu:'新疆大头鱼俗名与正式物种身份待核；不能与塔里木裂腹鱼合并。', namucuoluoli:'地点俗名不能自动生成新物种；与高原裸鲤/裸裂尻等需分类核对。', gaoyuanluoli:'集合/俗名身份待核，不能将羊卓雍错、纳木错、青海湖合为一鱼种。', qinghailuoli:'青海湖子水体与纳木错不连通；不可因为同属qingzang共池就声称纳木错有。', kanglangbaiyu:'抚仙湖记录不能映射洱海地标。', daliliefuyu:'洱海意向现有鱼；未在本名录中找到不代表可删；保育展示资格另审。', dianchijinyuba:'滇池/地下水意向不能映射洱海敞水；未在本名录中找到不代表可删。', talimuliefuyu:'现有塔里木意向与北疆额尔齐斯河鱼不共享分布。', xiweigaoyuanqiu:'体型小且微生境特殊；名录未收录不等不能被钩获。'
};
const rows = selected.map(([id,name,level,regionIds,potential,refs,evidence,status])=>{
 const r=records.find(x=>x.id===id);
 return {record_kind:'new_candidate',game_id:'',name_zh:name,scientific_name:r.scientificName,scientific_name_basis:'source_snapshot_unrevised',source_f_ids:id,source_class:r.category,source_h_codes:r.habitats.join('|'),angling_evidence:(r.category==='A'?'数据库游钓标签；':r.category==='B'?'数据库钩线字段；':'区域补充；')+(r.block.includes('逐种资料明确')?'名录含逐种资料，未复核原引用':'具体普通竿钓未独立核实'),new_to_game:'true',existing_overlap:'否；与42条意向学名去重；现有表本身无学名字段',region_evidence_level:level,supported_region_ids:regionIds,potential_region_ids_unverified:potential,current_region_ids:'',basin_evidence:evidence,landmark_evidence:'待核；无本轮精确地标逐种采样证据',reference_ids:refs,reference_urls:refs.split('|').filter(Boolean).map(k=>sources[k].url).join('|'),status,user_review:'pending',notes:r.id==='F0616'?'名录将唇䱻归M16微物钓属类群推定，不复用为游戏钓法事实。':''};
});
const existingAudit = fish.map(f=>{
 const id=mapped[f.id]??''; const r=records.find(x=>x.id===id); const regionIds=regions.filter(x=>x.fish.includes(f.id)).map(x=>x.id).join('|');
 const match=id?'name_intent_alias_match':(['hualu','luofeiyu'].includes(f.id)?'ambiguous_taxon':'not_found_as_named_intent');
 const row={record_kind:'existing_review',game_id:f.id,name_zh:f.name,scientific_name:r?.scientificName??'',scientific_name_basis:id?'editorial_name_intent_not_game_canonical':'pending_do_not_invent',source_f_ids:id,source_class:r?.category??'',source_h_codes:r?.habitats.join('|')??'',angling_evidence:r?`源${r.category}类；本轮不提升为普通竿钓已核实`:'名录无确定对应；不能据此否定既有鱼',new_to_game:'false',existing_overlap:'是；保留既有ID',region_evidence_level:'E0-existing-not-reverified',supported_region_ids:'',potential_region_ids_unverified:'',current_region_ids:regionIds,basin_evidence:f.habitat,landmark_evidence:'现有水系文本不是12个地标的逐种证据；待核',reference_ids:'',reference_urls:'',status:'保留现状-名称与分布待后续审核',user_review:'pending',notes:notes[f.id]??(id?'只做原名/旧名意向对照，不声称当前区域或地标已经通过分布核验。':'未见确定源条目；需补独立流域与分类来源，不用相近种凑数。')};
 rows.push(row); return {gameId:f.id,name:f.name,sourceFId:id||null,intendedScientificName:r?.scientificName??null,matchStatus:match,currentRegionIds:regionIds.split('|'),issue:row.notes};
});
const arraysEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const regionFishMembershipMatchesRuntime=regions.length===runtimeRegions.length&&regions.every(region=>{
 const actual=runtimeRegions.find(r=>r.id===region.id);
 return actual&&arraysEqual(region.fish,actual.fish.map(([id])=>id));
});
const existingRegionMappingsMatchesRuntime=existingAudit.length===runtimeFish.length&&existingAudit.every(existing=>{
 const actualIds=runtimeRegions.filter(region=>region.fish.some(([id])=>id===existing.gameId)).map(region=>region.id);
 const csvRow=rows.find(row=>row.record_kind==='existing_review'&&row.game_id===existing.gameId);
 return arraysEqual(existing.currentRegionIds,actualIds)&&csvRow.current_region_ids===actualIds.join('|');
});
const sourceMethodsAllNonEmpty=records.every(r=>Boolean(r.methodLabel&&r.method));
if(!regionFishMembershipMatchesRuntime||!existingRegionMappingsMatchesRuntime||!sourceMethodsAllNonEmpty){
 throw new Error('Documentation export validation failed: region membership, existing mappings, or source method parse mismatch.');
}
const headers=Object.keys(rows[0]);
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync(path.join(__dirname,'candidates.csv'),'\uFEFF'+[headers.map(quote).join(','),...rows.map(r=>headers.map(h=>quote(r[h])).join(','))].join('\r\n')+'\r\n','utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const checks={reviewState:'pending-user-review-no-game-changes',date:'2026-10-24',timezone:'Asia/Shanghai',source:summary,inputs:{gameConfig:{path:configPath,sha256:hash(configPath)},artDirection:{path:artPath,sha256:hash(artPath)}},structure:{expectedSections:7,sectionHeadings:[...fs.readFileSync(summary.sourcePath,'utf8').matchAll(/^[一二三四五六七]、.+$/gm)].map(x=>x[0].trim()),referenceBibliographyRows:(fs.readFileSync(summary.sourcePath,'utf8').match(/^FB#\d+/gm)??[]).length,methods:24,methodCodes:'M00—M23',sourceDate:'2026-10-22',sourceSnapshot:'FishBase v25.04 (2025-04)',freshwaterAndMainlandExample:records.filter(r=>r.ecology.startsWith('淡水')&&/中国大陆/.test(r.distribution)).length,countryExamplesAreNonExhaustive:true},screening:{workflow:'2701条完整结构解析→生态/水域/名称人工分层→20条审核候选；未对未入选2681条作逐种科学排除',newCandidateCount:20,existingReviewCount:fish.length,csvDataRows:rows.length,newCategories:selected.reduce((o,[id])=>(o[records.find(r=>r.id===id).category]=(o[records.find(r=>r.id===id).category]??0)+1,o),{}),regionalEvidenceCounts:{R1_original_research:10,R2_official_basin_or_suitability:2,R3_pending:8},exactLandmarkVerifiedCount:0,regionCoverageIsNotQuota:true,sourceTaxonStringDuplicates:summary.duplicateScientificNames,taxonomicSynonymClosureCompleted:false},existing:{fishCount:fish.length,regionCount:regions.length,matchCounts:existingAudit.reduce((o,x)=>(o[x.matchStatus]=(o[x.matchStatus]??0)+1,o),{}),rows:existingAudit},regions,sources,limits:['R1证明调查时间/水系内记录，不证明2026年当下丰度或每个子水体','R2适配/官方材料不升级成实测存在','所有20新增候选仍待用户审核；8个待核不能直接上线','A/B/C与R1/R2/R3是相互独立的证据轴','仅做学名字符串唯一性统计，未声称2701是去科学异名后的独立有效物种数','不包含海外/远洋扩区、法律结论、现实垂钓许可或实地钓法指导'],mutationScope:{allowedDirectory:'docs/next-iteration/roles/fish-catalogue',gameConfigChanged:false,fishOrWeightsOrPricesChanged:false,routesChanged:false,savesChanged:false},verification:{sourceBytesRead:summary.bytes,allFRecordsParsed:summary.total===2701,sourceClassTotalsMatch:summary.categoryCounts.A===1556&&summary.categoryCounts.B===1132&&summary.categoryCounts.C===13,idsContinuous:summary.contiguousIds,exactSnapshotNameUnique:summary.uniqueScientificNames===2701,candidatesAllHaveValidFId:rows.filter(x=>x.record_kind==='new_candidate').every(x=>records.some(r=>r.id===x.source_f_ids)),candidateIdsUnique:new Set(selected.map(x=>x[0])).size===20,regionIdsValid:rows.every(r=>[r.supported_region_ids,r.potential_region_ids_unverified,r.current_region_ids].flatMap(x=>x.split('|').filter(Boolean)).every(id=>regions.some(x=>x.id===id))),candidateDoesNotReuseMappedExistingFId:selected.every(([id])=>!Object.values(mapped).includes(id)),gameRuntimeTests:'not_run_documentation_only'}};
Object.assign(checks.verification,{regionFishMembershipMatchesRuntime,existingRegionMappingsMatchesRuntime,sourceMethodsAllNonEmpty,regionFishMembershipTotal:regions.reduce((sum,r)=>sum+r.fish.length,0),regionFishCounts:Object.fromEntries(regions.map(r=>[r.id,r.fish.length]))});
Object.assign(checks.inputs.gameConfig,{revision:baselineRevision,sha256:crypto.createHash('sha256').update(baselineConfig).digest('hex')});
checks.baselineMode='historical-1.1.1-approved-planning-snapshot';
fs.writeFileSync(path.join(__dirname,'catalogue-check.json'),JSON.stringify(checks,null,2)+'\n','utf8');
console.log(JSON.stringify({csvRows:rows.length,existingFish:fish.length,regions:regions.length,candidates:selected.length,existingMatchCounts:checks.existing.matchCounts,newCategories:checks.screening.newCategories,verification:checks.verification},null,2));
}
buildHistoricalSnapshot().catch(error=>{console.error(error);process.exitCode=1;});
