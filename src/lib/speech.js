// ===== 小人台词库（可自由增删，不改逻辑）=====
// 每种场景一组台词，钓鱼过程中随机抽取；语气用于气泡配色
export const SPEECH = {
  // 长时间没鱼：小人自言自语
  idle: [
    "怎么还不上鱼…",
    "水面这么平静，鱼都跑哪去了？",
    "再等等，应该快了。",
    "今天鱼口不太行啊…",
    "浮漂一动不动的。",
    "换口气，继续等。",
  ],
  // 普通鱼获
  success: [
    "太棒了！",
    "上鱼了！",
    "成了！",
    "嘿嘿，没白等。",
    "收竿，入篓。",
  ],
  // 稀有及以上鱼获（语气更高昂）
  rare: [
    "这条鱼品相不错！",
    "有点意思，收着。",
    "少见少见，运气不错。",
  ],
  high: [
    "这下可以大赚一笔！",
    "好家伙，稀客！",
    "今天运气不错，值了！",
    "这条能卖个好价钱！",
  ],
  // 咬钩了但没在窗口内点击收竿
  miss: [
    "太可惜了…",
    "就差一点。",
    "唉，鱼跑了。",
    "没赶上，再来。",
  ],
  // 还没咬钩就戳浮漂：催一催、劝一劝
  impatient: [
    "别急。",
    "心急钓不了大鱼。",
    "再等等，鱼还没咬钩。",
    "稳住，别惊了窝子。",
  ],
  // 10 秒内连点 5 次浮漂：准空军预定
  airForce: ["你这样钓鱼准空军。"],
};

// 按场景随机抽一句；同一句不连续重复
const lastPicked = {};
export const pickLine = (tone) => {
  const pool = SPEECH[tone] || SPEECH.idle;
  if (pool.length === 1) return pool[0];
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (line === lastPicked[tone]) {
    line = pool[(pool.indexOf(line) + 1) % pool.length];
  }
  lastPicked[tone] = line;
  return line;
};
