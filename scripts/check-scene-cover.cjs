// Local production-renderer visual harness. No native EXE or player profile is used.
// node scripts/check-scene-cover.cjs: serve on localhost for the built-in browser.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'build-desktop');
let server, directory;
const report = { startedAt: new Date().toISOString(), passed: false, version: require('../package.json').version,
  scope: 'Production build-desktop in the in-app Chromium browser, with an explicit in-memory desktop bridge and two iframe widget viewports. NOT a native EXE, installer, disk save, network weather or actual transparency integration acceptance.',
  limitations: ['All coins, ownership and weather are synthetic fixtures; no real player profile is read or written.',
    'Viewport measurements exercise the real production renderer and CSS. They do not certify native launch, desktop compositing or pinning.',
    'No external requests are authorized by this harness. The desktop environment API always rejects; CSP permits only this localhost origin.'],
  fixtures: [], browserChecks: [], errors: [], events: [] };
const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); };
const script = (response, value) => { response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(value); };
const writeReport = async () => fs.writeFile(path.join(directory, 'scene-cover.json'), JSON.stringify(report, null, 2));
const bridgeScript = (fixture, preset) => `(() => {
  let state = ${JSON.stringify(fixture)};
  const RealDate=Date;let offset=0;
  window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[RealDate.now()+offset]));}static now(){return RealDate.now()+offset;}};
  addEventListener('message',event=>{if(event.origin===location.origin&&event.data.type==='cover-advance')offset+=180001;});
  const info = () => ({name:'PondClock scene-cover browser/mock', version:${JSON.stringify(report.version)}, editionId:'first-focus', platform:'browser-mock', packaged:false, sizePreset:${JSON.stringify(preset)}, alwaysOnTop:false});
  window.pondDesktop = Object.freeze({loadSave:async()=>({snapshot:structuredClone(state),recovery:null}),
    saveGame:async(next)=>{state=structuredClone(next);return {status:'committed',snapshot:structuredClone(state)};},
    getAppInfo:async()=>info(), windowAction:async()=>info(), onLifecycle:()=>()=>{}, ackLifecycle:async()=>true,
    requestEnvironment:async()=>{throw new Error('Live environment disabled in scene-cover test');},
    exportSave:async()=>({canceled:true}), importSave:async()=>({canceled:true})});
})();`;
const inspectionScript = `(() => {
  const report = async (type, value) => {
    await fetch('/record', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,url:location.href,...value})});
    parent.postMessage({type:'cover-result',value:{type,...value}},location.origin);
  };
  addEventListener('error', e=>void report('error',{message:e.message}));
  addEventListener('unhandledrejection', e=>void report('error',{message:String(e.reason)}));
  const rect = element => { const b=element.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}; };
  const wait = () => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const inspect = async () => {
    const start=performance.now();
    let pond,art,svg;
    do { await wait();pond=document.querySelector('.pond-scene');art=pond?.querySelector('.pond-artboard');svg=art?.querySelector(':scope > svg'); }
    while((!pond||!art||!svg||!art.style.width.endsWith('px'))&&performance.now()-start<15000);
    if(!pond||!svg)throw new Error('Production scene did not appear');
    const images=await Promise.all([...pond.querySelectorAll('image')].map(async element=>{const image=new Image();image.src=element.getAttribute('href');await image.decode();return {src:image.src,width:image.naturalWidth,height:image.naturalHeight};}));
    const p=rect(pond),a=rect(art),s=rect(svg),matrix=svg.getScreenCTM();
    const actor=pond.querySelector('[data-classic-source="1.1.1"]');
    const actorPoint=new DOMPoint(855,190).matrixTransform(actor.getScreenCTM());
    const floatPoint=new DOMPoint(528,320).matrixTransform(matrix);
    const hit=point=>({x:point.x,y:point.y,button:document.elementFromPoint(point.x,point.y)?.closest('button')?.getAttribute('aria-label')||null});
    const footPoint=new DOMPoint(866,247).matrixTransform(actor.getScreenCTM());
    const celestial=pond.querySelector('[data-celestial="sun"]');
    const sun=celestial?rect(celestial):null;
    const passed=art.style.width.endsWith('px')&&s.x<=p.x+1.2&&s.right>=p.right-1.2&&s.y<=p.y+1.2&&s.bottom>=p.bottom-1.2&&Math.abs(matrix.a-matrix.d)<.0001&&Math.abs(matrix.b)<.0001&&Math.abs(matrix.c)<.0001&&footPoint.y<=p.bottom&&footPoint.y>=p.y&&hit(actorPoint).button==='点击渔翁'&&hit(floatPoint).button==='点击浮漂'&&document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight;
    const result={passed,settled:art.style.width.endsWith('px'),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,region:pond.dataset.sceneRegion,
      sceneStyle:pond.dataset.sceneStyle,weather:pond.dataset.precipitation,background:getComputedStyle(pond).backgroundColor,pond:p,art:a,svg:s,
      matrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d,e:matrix.e,f:matrix.f},actor:hit(actorPoint),float:hit(floatPoint),foot:{x:footPoint.x,y:footPoint.y},sun,images};
    await report('layout',result);
  };
  document.addEventListener('click',event=>{
    const label=event.target.closest('button')?.getAttribute('aria-label');
    if(!['点击渔翁','点击浮漂'].includes(label))return;
    setTimeout(()=>{const bubble=document.querySelector('.pond-speech');if(!bubble)return void report('interaction',{passed:false,label,reason:'No speech appeared'});
      const b=rect(bubble),p=rect(document.querySelector('.pond-scene'));
      void report('interaction',{passed:b.x>=p.x&&b.right<=p.right&&b.y>=p.y&&b.bottom<=p.bottom,label,bubble:b,text:bubble.textContent});},400);
  });
  inspect().catch(error=>void report('error',{message:String(error)}));
  addEventListener('message',event=>{if(event.origin===location.origin&&event.data.type==='cover-inspect')inspect().catch(error=>void report('error',{message:String(error)}));});
})();`;

async function run() {
  directory = await fs.mkdtemp(path.join(root, 'test-results/scene-cover-'));
  const [{ createNewGame }, { validateSave }, { APPEARANCE_PRODUCTS }, { REGIONS }] = await Promise.all([
    import(pathToFileURL(path.join(root, 'src/domain/gameState.js'))), import(pathToFileURL(path.join(root, 'src/domain/saveSchema.js'))),
    import(pathToFileURL(path.join(root, 'src/config/appearance.js'))), import(pathToFileURL(path.join(root, 'src/lib/gameConfig.js'))) ]);
  const html = await fs.readFile(path.join(build, 'index.html'), 'utf8');
  report.productionHtmlSha256 = createHash('sha256').update(html).digest('hex');
  for (const asset of [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"?]+)"/g)].map(match=>match[1])) {
    report.fixtures.push({asset,sha256:createHash('sha256').update(await fs.readFile(path.join(build, asset))).digest('hex')});
  }
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:");
      if (url.pathname === '/record' && request.method === 'POST') {
        let data='';for await(const chunk of request){data+=chunk;if(data.length>100000)throw new Error('Report too large');}
        const record={at:new Date().toISOString(),...JSON.parse(data)};
        if(record.type==='layout')report.browserChecks.push(record);else if(record.type==='error')report.errors.push(record);else report.events.push(record);
        const scenarios=new Set(report.browserChecks.filter(item=>item.passed&&item.settled).map(item=>[item.width,item.height,item.sceneStyle,item.weather].join(':')));
        report.passed=scenarios.size>=12&&report.browserChecks.every(item=>item.passed)&&report.events.length>=4&&report.events.every(item=>item.passed)&&report.errors.length===0;
        await writeReport();json(response,{ok:true});return;
      }
      if (url.pathname === '/report.json') { json(response, report);return; }
      if (url.pathname === '/inspection.js') {script(response,inspectionScript);return;}
      if (url.pathname === '/bridge.js') {
        const style=url.searchParams.get('style')==='inkwash'?'inkwash':'minimal';
        const weather=['clear','rain','snow'].includes(url.searchParams.get('weather'))?url.searchParams.get('weather'):'clear';
        const preset=url.searchParams.get('size')==='comfortable'?'comfortable':'compact';
        const base=createNewGame('lingnan',Date.now(),{randomSeed:471});
        const fixture=validateSave({...base,coins:5000,unlockedRegions:REGIONS.map(r=>r.id),
          appearance:{ownedProducts:APPEARANCE_PRODUCTS.map(p=>p.id),equipped:{scene:style,character:'minimal',rod:'minimal'}},
          settings:{...base.settings,onlineEnhancements:false,biteSoundEnabled:false,sceneWeatherMode:'manual',manualWeather:weather}});
        script(response,bridgeScript(fixture,preset));return;
      }
      if (url.pathname === '/frame') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        response.end(html.replace('<head>',`<head><script src="/bridge.js?${url.searchParams.toString()}"></script><script defer src="/inspection.js"></script>`));return;
      }
      if (url.pathname === '/') {
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        response.end(`<!doctype html><meta charset="utf-8"><title>PondClock 2.0.1 场景核验</title><style>body{background:#dee5e6;font:14px system-ui;margin:16px;color:#263c46}header{margin-bottom:12px}iframe{display:block;border:0;margin:8px 0;background:repeating-linear-gradient(45deg,#e9eced 0 8px,#eee 8px 16px)}.row{display:flex;align-items:flex-start;gap:20px}pre{font-size:11px;white-space:pre-wrap;max-width:1000px}</style><header><h1>真实生产页面 · 浏览器画面核验</h1><p>仅显式测试数据与模拟桌面桥；不代表EXE／安装器／实况天气验收。</p><label>插画 <select id="style"><option value="minimal">简洁</option><option value="inkwash">水墨</option></select></label> <label>天气 <select id="weather"><option value="clear">晴</option><option value="rain">雨</option><option value="snow">雪</option></select></label> <button id="apply">查看组合</button> <button id="inspect">重新记录画面</button> <button id="advance">测试航程快进180秒</button></header><div class="row"><section><p>420 × 350</p><iframe id="compact" width="420" height="350"></iframe></section><section><p>640 × 490</p><iframe id="comfortable" width="640" height="490"></iframe></section></div><pre id="results"></pre><script>
        const load=()=>{results.textContent='';for(const size of ['compact','comfortable'])document.getElementById(size).src='/frame?style='+document.getElementById('style').value+'&weather='+document.getElementById('weather').value+'&size='+size;};
        document.getElementById('apply').onclick=load;
        document.getElementById('inspect').onclick=()=>{for(const size of ['compact','comfortable'])document.getElementById(size).contentWindow.postMessage({type:'cover-inspect'},location.origin);};
        document.getElementById('advance').onclick=()=>{for(const size of ['compact','comfortable'])document.getElementById(size).contentWindow.postMessage({type:'cover-advance'},location.origin);};
        addEventListener('message',event=>{if(event.origin===location.origin&&event.data.type==='cover-result')results.textContent+=JSON.stringify(event.data.value)+'\\n';});load();</script>`);return;
      }
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target=path.resolve(build,relative);
      if(!target.startsWith(build+path.sep)){json(response,{error:'Outside build'},403);return;}
      const bytes=await fs.readFile(target);
      const mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.html':'text/html'}[path.extname(target)]||'application/octet-stream';
      response.writeHead(200,{'Content-Type':mime});response.end(bytes);
    }catch(error){json(response,{error:String(error)},500);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  report.origin=`http://127.0.0.1:${server.address().port}`;
  await writeReport();
  console.log(JSON.stringify({origin:report.origin,report:path.join(directory,'scene-cover.json')}));
  process.on('SIGINT',()=>server.close(()=>process.exit(0)));
}
async function assess(input) {
  const target=path.resolve(input),results=path.join(root,'test-results');
  if(!target.startsWith(results+path.sep)||path.basename(target)!=='scene-cover.json')throw new Error('Assessment requires an owned scene-cover report');
  const value=JSON.parse(await fs.readFile(target,'utf8'));
  // Original first-frame data is retained. Only a measured 1000:440 artboard is
  // evidence for final cover/hot-area mapping; a 100% fallback is not.
  const stable=value.browserChecks.filter(item=>Math.abs(item.art.width/item.art.height-1000/440)<.001);
  const keys=new Set(stable.filter(item=>item.region==='lingnan').map(item=>[item.width,item.sceneStyle,item.weather].join(':')));
  const missing=[];
  for(const width of [420,640])for(const style of ['minimal','inkwash'])for(const weather of ['none','rain','snow'])if(!keys.has([width,style,weather].join(':')))missing.push({width,style,weather});
  const inBounds=stable.every(item=>item.passed&&item.actor.button==='点击渔翁'&&item.float.button==='点击浮漂'&&item.width===item.scrollWidth&&item.height===item.scrollHeight);
  const switched=stable.filter(item=>new URL(item.url).searchParams.get('style')==='minimal'&&item.sceneStyle==='inkwash');
  const lowBank=stable.filter(item=>item.region==='dongnan');
  const requiredInteractions=new Set(value.events.filter(item=>item.passed).map(item=>new URL(item.url).searchParams.get('size')+':'+item.label));
  const screenshotFiles=[];
  for(const file of ['both-sizes-ink-snow.png','both-sizes-low-bank-travel.png','both-sizes-low-bank-dialogue.png']) {
    const bytes=await fs.readFile(path.join(path.dirname(target),file));
    const png=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
    screenshotFiles.push({file,bytes:bytes.length,format:png?'png':bytes.subarray(0,2).toString('hex')==='ffd8'?'jpeg':'unknown',sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  value.finalAssessment={at:new Date().toISOString(),passed:missing.length===0&&inBounds&&requiredInteractions.size>=4&&new Set(switched.map(x=>x.width)).size===2&&new Set(lowBank.map(x=>x.width)).size===2&&value.errors.length===0,
    rawLayouts:value.browserChecks.length,settledLayouts:stable.length,requiredScenarios:12,missingScenarios:missing,
    allSettledTransformsAndHotAreasPass:inBounds,basicInteractionPairs:requiredInteractions.size,
    sameDocumentMinimalToInkWidths:[...new Set(switched.map(x=>x.width))],sameDocumentLowBankTravelWidths:[...new Set(lowBank.map(x=>x.width))],
    screenshots:screenshotFiles,actualTwoLineLongSpeechVerified:false,
    limitation:'Production renderer browser/mock only. First-frame samples remain in browserChecks; final assessment excludes them by the real 1000:440 stage ratio. Long text did not arise randomly; do not claim two-line visual acceptance.'};
  value.passed=value.finalAssessment.passed;value.finishedAt=new Date().toISOString();
  await fs.writeFile(target,JSON.stringify(value,null,2));
  console.log(JSON.stringify(value.finalAssessment));
}
(process.argv[2]==='--assess'?assess(process.argv[3]):run()).catch(error=>{console.error(error);process.exitCode=1;});
