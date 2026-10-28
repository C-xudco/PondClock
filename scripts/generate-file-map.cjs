// Documentation only: enumerate maintained files, never node_modules/builds/saves.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root}).toString().split('\0').filter(Boolean))].sort();
const special = {
  'src/pages/Index.jsx': '页面入口、主界面与面板接线；改界面组合从这里开始',
  'src/hooks/useFishingGame.js': '连接React与GameSession，提交用户动作及投影状态',
  'src/hooks/fishingRuntime.js': '普通/主动/专注调度与休眠缺口；禁止补离线收益',
  'src/application/gameSession.js': '串行事务、可信计时、持久化回执与重放；资产可靠性核心',
  'src/domain/gameState.js': '通用领域命令：售卖、物品、旅行、外观、图鉴与设置',
  'src/domain/editionGameplay.js': '第一版普通/主动钓鱼、专注状态机和奖励结算',
  'src/domain/editionState.js': '第一版字段初值与状态校验；扩展奖励/道具状态联动',
  'src/domain/saveSchema.js': '完整存档验证与旧版本迁移；禁止直接绕过校验写档',
  'src/domain/loot.js': '正式捕获随机流、鱼/道具选择、修表与直售价',
  'src/domain/market.js': '鱼池推导市场稀缺系数，统一鲜鱼报价与过期处理',
  'src/domain/routes.js': '全地区有向航线、距离、票价和时间推导',
  'src/lib/gameConfig.js': '原始鱼种/水域/品质及导出；旧数值升级/演示字段不是V2正式入口',
  'src/lib/gameUtils.js': '查询/格式工具与历史演示随机；不要误当正式资产结算',
  'src/data/focusRegions.js': 'V2五区六鱼增量数据，按稳定ID合并导出',
  'src/data/fishSources.js': '鱼类学名/生态来源/游戏化证据；扩鱼需同步',
  'src/data/regionLocations.js': '地区代表坐标、IP城市/省映射依据',
  'src/data/sceneSites.js': '水域代表景点、地址、时区及天气参照点',
  'src/data/dialogueCatalog.js': '事件对白文本池；配合dialogueDirector防机械循环',
  'src/lib/dialogueDirector.js': '对白事件选择、冷却、重复与连点状态',
  'src/config/lootConfig.js': '互斥爆率表、物品定义、修表及秘籍参数',
  'src/config/balance.js': '鱼价转换、地区品质修正、高级饵/保底/主动品质倍率',
  'src/config/activeFishing.js': '自动30%、普通等候、主动竿价格/次数/色带',
  'src/config/focus.js': '番茄时长、每日轮数和鱼饵奖励',
  'src/config/economy.js': '168h过期1金币、市场丰产/缺产与体重系数',
  'src/config/storage.js': '游戏版本、schema、edition和默认设置',
  'src/config/appearance.js': '外观商品、金币价格、稳定ID和三槽权益',
  'src/components/panels/CodexPanel.jsx': '鱼类图鉴显示与地区过滤，不是独立物品图鉴',
  'src/components/panels/BucketPanel.jsx': '鱼篓和物品售卖/修理/使用界面',
  'src/components/pond/Pond.jsx': '统一场景组合、天气/人物/浮漂画布和标签',
  'src/components/pond/sceneViewport.js': 'V2.0.1 cover坐标、人物下沿和对白/日月可见区',
  'src/components/pond/useSceneViewport.js': 'ResizeObserver；同尺寸换几何也更新偏移',
  'src/components/pond/ClassicFisherman.jsx': '免费经典1.1.1人物剪影、天气叠层和鱼线',
  'src/components/pond/Fisherman.jsx': '人物槽选择、可选PNG/其他人物、竿外观接入',
  'src/components/pond/scene.js': '17水域几何、水面边界、人物/浮漂/对白锚点',
  'src/components/pond/ActiveFishingBar.jsx': '主动条平滑显示与聚焦按键，不自行决定随机成功',
  'src/storage/repository.js': 'Web/桌面保存适配入口',
  'desktop/main.cjs': 'Electron安全窗口、受限IPC、保存与网络宿主',
  'desktop/preload.cjs': '暴露最小桌面桥，不暴露任意文件或命令执行',
  'desktop/saveRepository.cjs': '双槽校验和、原子落盘与恢复',
  'desktop/edition.cjs': '专注版身份、旧档只读复制和原始槽备份',
  'desktop/lifecycle.cjs': '休眠/恢复/关闭前确认，可信计时和保存收尾',
  'desktop/installer.nsh': '安装器进程检查扩展；完整安装链仍未验收',
  'scripts/verify-release.cjs': '版本/ASAR/运行资源/ZIP一致性；portable-only跳过安装器',
};
function classify(file) {
  if (special[file]) return [special[file], '当前实现；验证范围见对应测试/版本验收'];
  if (file.startsWith('src/components/ui/')) return ['通用UI模板/组件；修改前先确认实际引用及上游许可', '复用层，不代表每个组件都被游戏使用'];
  if (file.startsWith('src/config/')) return ['该功能的参数/枚举配置；联动领域实现、schema和界面', '当前配置，历史兼容字段需看注释'];
  if (file.startsWith('src/components/pond/')) return ['场景图层/动画/坐标显示；保持共同几何与天气契约', '当前渲染实现'];
  if (file.startsWith('src/components/panels/')) return ['功能面板；只发命令/读状态，资产结算到domain改', '当前UI实现'];
  if (file.startsWith('src/services/') || file.startsWith('src/hooks/')) return ['网络/调度/React接线；沿用有界队列与隔离保存', '当前实现；离线/缓存/失败路径要保留'];
  if (file.startsWith('tests/')) return ['对同名模块的规则/故障/结构测试；不能替代实际EXE验收', '自动验证源，不是运行游戏资源'];
  if (file.startsWith('scripts/smoke') || file.includes('check-installer') || file.includes('check-focus-installer')) return ['环境相关验收工具；先读版本、档案路径和启动条件', '部分为历史脚本；安装成功未保证'];
  if (file.startsWith('scripts/')) return ['构建/导出/审计/发布工具；读输出目录后运行', '维护工具，不参与游戏资产规则'];
  if (file.includes('/references/') && /\.(png|jpg|jpeg)$/i.test(file)) return ['本地用户参考原图，未有公开再分发授权', '排除公开镜像和全部公开历史'];
  if (file.startsWith('public/')) return ['随包本地资源；改素材同步几何、来源和资源审计', '运行资源；授权见COPYRIGHT'];
  if (file.startsWith('docs/')) return ['说明/提案/验收/来源材料；按标题区分历史与当前', '文档证据，不自动成为开发指令'];
  if (file.startsWith('desktop/')) return ['Windows宿主/资源；安全设置、窗口与保存接口', '当前宿主或使用说明'];
  if (file.startsWith('src/')) return ['前端入口/样式/工具；沿引用关系修改并做相关检查', '当前源码/模板'];
  return ['项目配置、许可或入口文档；不放个人数据/构建产物', '项目维护文件'];
}
const out = ['# 逐文件开发导航', '', '由 scripts/generate-file-map.cjs 生成。对应当前工作树；源码、测试、历史计划、运行素材分别列出。状态是职责分类，不代表每个文件都经过独立实机验收。', '',
  '查找功能优先使用 [架构](ARCHITECTURE.md)、[内容/数值](CONTENT_AND_BALANCE.md)、[Debug](DEBUGGING.md)。本地参考原图行会在公开镜像生成时移除，许可与发布过滤见COPYRIGHT及publishing。', '', '| 文件 | 职责/修改位置 | 开发情况/边界 |', '| --- | --- | --- |'];
for (const file of files) { if (!fs.existsSync(path.join(root, file))) continue; const [purpose,status] = classify(file); out.push(`| [${file}](<../../${file}>) | ${purpose} | ${status} |`); }
fs.mkdirSync(path.join(root,'docs/development'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/development/FILE_MAP.md'), out.join('\n')+'\n');
console.log(JSON.stringify({files:files.length,output:'docs/development/FILE_MAP.md'}));
