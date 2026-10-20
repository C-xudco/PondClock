import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  RODS,
  JUDGE,
  BITE,
  BAIT_COST,
  BAIT_CATCHES,
  BAIT_QUALITY_BONUS,
  DEFAULT_REGION,
} from "@/lib/gameConfig";
import {
  rollFish,
  calcSellPrice,
  updateCodex,
  qualityById,
  regionById,
  randInt,
} from "@/lib/gameUtils";
import { pickLine } from "@/lib/speech";

const START_COINS = 100;   // 初始金币
const START_BAIT = 2;      // 初始赠送鱼饵份数
const SPEECH_MS = 4600;    // 气泡停留时长
const WAIT_FLOOR = 25;     // 咬钩间隔下限（鱼竿再快也不会低于此值）

// 开发调试：?bite=4 可把咬钩等待缩短到 4 秒、?coins=5000 可覆盖初始金币（生产构建不生效）
const readDevNumber = (key) => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get(key);
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
};
const DEV_BITE_SECONDS = readDevNumber("bite");
const DEV_COINS = readDevNumber("coins");

// 下一次咬钩的基础等待：55-125 秒起步，鱼竿缩短间隔；挂机越久略微提速（最多 12%）
const rollWaitSeconds = (rodLevel, idleSeconds = 0) => {
  if (DEV_BITE_SECONDS) return Math.round(DEV_BITE_SECONDS);
  const base = randInt(BITE.minSeconds, BITE.maxSeconds);
  const rod = RODS[rodLevel] || RODS[0];
  const idleBoost = 1 - Math.min(0.12, (idleSeconds / 3600) * 0.04);
  return Math.max(WAIT_FLOOR, Math.round(base * rod.intervalMult * idleBoost));
};

export function useFishingGame(geoRegionId) {
  const [coins, setCoins] = useState(() => DEV_COINS ?? START_COINS);
  const [currentRegion, setCurrentRegion] = useState(DEFAULT_REGION);
  const [homeRegion, setHomeRegion] = useState(DEFAULT_REGION);
  const [unlockedRegions, setUnlockedRegions] = useState([DEFAULT_REGION]);
  const [rodLevel, setRodLevel] = useState(0);
  const [baitCount, setBaitCount] = useState(START_BAIT);
  const [baitLeft, setBaitLeft] = useState(0);
  const [bucket, setBucket] = useState([]);
  const [codex, setCodex] = useState({});
  const [pityCounter, setPityCounter] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | bite
  const [windowLeft, setWindowLeft] = useState(0);
  const [waitLeft, setWaitLeft] = useState(() => rollWaitSeconds(0));
  const [speech, setSpeech] = useState(null); // { text, tone }

  const statusRef = useRef("idle");
  const windowRef = useRef(0);
  const waitRef = useRef(waitLeft);
  const rodRef = useRef(0);
  const idleRef = useRef(0);            // 累计挂机秒数（影响触发频率）
  const chatterRef = useRef(randInt(30, 60)); // 下一次自言自语倒计时
  const traveledRef = useRef(false);
  const speechTimer = useRef(null);
  const speechSeq = useRef(0);

  useEffect(() => {
    rodRef.current = rodLevel;
  }, [rodLevel]);

  // 小人说话：pool 决定台词，tone 决定气泡配色（idle/success/high/miss）
  const say = useCallback((pool, tone = pool) => {
    speechSeq.current += 1;
    setSpeech({ text: pickLine(pool), tone, id: speechSeq.current });
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => setSpeech(null), SPEECH_MS);
  }, []);

  useEffect(
    () => () => {
      if (speechTimer.current) clearTimeout(speechTimer.current);
    },
    []
  );

  // 还没咬钩时戳浮漂：小人会劝两句；10 秒内连点 5 次触发"准空军"调侃
  const pokeTimesRef = useRef([]);
  const pokeBobber = useCallback(() => {
    if (statusRef.current !== "idle") return; // 咬钩时点击浮漂等同收竿
    const now = Date.now();
    const recent = pokeTimesRef.current.filter((t) => now - t <= 10000);
    recent.push(now);
    pokeTimesRef.current = recent;
    if (recent.length >= 5) {
      pokeTimesRef.current = [];
      say("airForce", "miss");
      return;
    }
    say("impatient", "idle");
  }, [say]);

  // 核心状态机：IDLE 挂机等待 → BITE 判定窗口倒计时 → 点击成功 / 超时失败
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusRef.current === "idle") {
        idleRef.current += 1;
        waitRef.current -= 1;
        if (waitRef.current <= 0) {
          const rod = RODS[rodRef.current] || RODS[0];
          windowRef.current = JUDGE.windowSeconds + rod.windowBonus;
          statusRef.current = "bite";
          setStatus("bite");
          setWindowLeft(windowRef.current);
          setWaitLeft(0);
          chatterRef.current = randInt(35, 75);
        } else {
          setWaitLeft(waitRef.current);
          // 等太久没鱼，小人开始自言自语
          chatterRef.current -= 1;
          if (chatterRef.current <= 0) {
            say("idle");
            chatterRef.current = randInt(35, 75);
          }
        }
      } else {
        windowRef.current -= 1;
        if (windowRef.current <= 0) {
          statusRef.current = "idle";
          setStatus("idle");
          setWindowLeft(0);
          waitRef.current = rollWaitSeconds(rodRef.current, idleRef.current);
          setWaitLeft(waitRef.current);
          chatterRef.current = randInt(35, 75);
          say("miss");
        } else {
          setWindowLeft(windowRef.current);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [say]);

  // IP 属地跟随：自动定位到最近的本地水域，免费且默认启用
  useEffect(() => {
    if (!geoRegionId || traveledRef.current) return;
    setHomeRegion(geoRegionId);
    setUnlockedRegions((prev) => (prev.includes(geoRegionId) ? prev : [...prev, geoRegionId]));
    setCurrentRegion(geoRegionId);
  }, [geoRegionId]);

  // 判定窗口内点击收竿 → 品质/尺寸结算 + 图鉴记录 + 保底计数 + 鱼饵消耗
  const catchFish = useCallback(() => {
    if (statusRef.current !== "bite") return;

    // 鱼饵：优先消耗当前一份，用尽后自动启用库存中的下一份
    let usedBait = false;
    let nextBaitLeft = baitLeft;
    let nextBaitCount = baitCount;
    if (baitLeft > 0) {
      usedBait = true;
      nextBaitLeft = baitLeft - 1;
    } else if (baitCount > 0) {
      usedBait = true;
      nextBaitCount = baitCount - 1;
      nextBaitLeft = BAIT_CATCHES - 1;
    }

    // 最佳点击区间加成（默认关闭：qualityBonusBest 为 0 时不生效）
    const rod = RODS[rodLevel] || RODS[0];
    const fullWindow = JUDGE.windowSeconds + rod.windowBonus;
    const elapsed = Math.max(0, fullWindow - windowRef.current);
    const inBestWindow =
      elapsed >= JUDGE.bestClickStart && elapsed <= JUDGE.bestClickEnd;
    const bestBonus =
      JUDGE.qualityBonusBest > 0 && inBestWindow ? JUDGE.qualityBonusBest : 0;
    const baitBonus = usedBait ? BAIT_QUALITY_BONUS : 0;

    const fish = rollFish(currentRegion, {
      qualityBonus: rod.qualityBonus + baitBonus + bestBonus,
      pity: pityCounter,
    });

    setBucket((b) => [...b, fish]);
    setCodex((c) => updateCodex(c, fish));
    const isHigh = fish.quality === "epic" || fish.quality === "legendary";
    setPityCounter((p) => (isHigh ? 0 : p + 1));
    if (usedBait) {
      setBaitLeft(nextBaitLeft);
      setBaitCount(nextBaitCount);
    }

    // 回到 IDLE，重新开始下一轮等待
    statusRef.current = "idle";
    windowRef.current = 0;
    setStatus("idle");
    setWindowLeft(0);
    waitRef.current = rollWaitSeconds(rodLevel, idleRef.current);
    setWaitLeft(waitRef.current);
    chatterRef.current = randInt(35, 75);

    // 小人反应：高品质大赚一笔 / 普通鱼也开心
    if (isHigh) say("high", "high");
    else if (fish.quality === "rare") say("rare", "success");
    else say("success", "success");

    const q = qualityById(fish.quality);
    toast.success(`钓到「${q.name}·${fish.name}」 ${fish.length}cm / ${fish.weight}kg`);
  }, [baitLeft, baitCount, currentRegion, rodLevel, pityCounter, say]);

  // 卖单条 / 清空鱼篓：只动金币，不触碰图鉴记录
  const sellOne = (uid) => {
    const fish = bucket.find((f) => f.uid === uid);
    if (!fish) return;
    setBucket((b) => b.filter((f) => f.uid !== uid));
    setCoins((c) => c + calcSellPrice(fish));
    toast.success(`卖出 ${fish.name}，获得 ¥${calcSellPrice(fish)}`);
  };

  const sellAll = () => {
    if (!bucket.length) return;
    const total = bucket.reduce((s, f) => s + calcSellPrice(f), 0);
    setBucket([]);
    setCoins((c) => c + total);
    toast.success(`清空鱼篓，共获得 ¥${total}`);
  };

  const buyBait = () => {
    if (coins < BAIT_COST) return toast.error("金币不足");
    setCoins((c) => c - BAIT_COST);
    setBaitCount((n) => n + 1);
    toast.success(`购买了 1 份高级鱼饵（共 ${BAIT_CATCHES} 次，钓到鱼时自动消耗）`);
  };

  const buyRod = () => {
    const next = RODS[rodLevel + 1];
    if (!next || coins < next.cost) return toast.error("金币不足");
    setCoins((c) => c - next.cost);
    setRodLevel((l) => l + 1);
    toast.success(`鱼竿升级为「${next.name}」！`);
  };

  // 漫游：已解锁免费往返；未解锁买机票后永久保留访问权
  const travelTo = (regionId) => {
    const region = regionById(regionId);
    if (!region || regionId === currentRegion) return;
    if (!unlockedRegions.includes(regionId)) {
      if (coins < region.flightPrice) {
        return toast.error(`金币不足，机票 ¥${region.flightPrice}`);
      }
      setCoins((c) => c - region.flightPrice);
      setUnlockedRegions((u) => [...u, regionId]);
      toast.success(`解锁「${region.name}」，访问权永久保留！`);
    } else {
      toast.success(`已前往「${region.name}」`);
    }
    traveledRef.current = true;
    setCurrentRegion(regionId);
  };

  return {
    coins,
    currentRegion,
    homeRegion,
    unlockedRegions,
    rodLevel,
    baitCount,
    baitLeft,
    bucket,
    codex,
    pityCounter,
    status,
    windowLeft,
    waitLeft,
    speech,
    catchFish,
    pokeBobber,
    sellOne,
    sellAll,
    buyBait,
    buyRod,
    travelTo,
  };
}
