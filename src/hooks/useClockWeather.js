import { useEffect, useState } from "react";

const WEATHERS = ["晴", "多云", "小雨", "雪"];
const SEASONS = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"];

// 时钟 + 天气环境数据：天气仅影响视觉，不影响钓鱼概率
export function useClockWeather() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState(() => WEATHERS[Math.floor(Math.random() * WEATHERS.length)]);

  // 每秒走针
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 模拟天气 API：每 5 分钟随机变化一次（接入真实 API 时替换此段）
  useEffect(() => {
    const t = setInterval(() => {
      setWeather(WEATHERS[Math.floor(Math.random() * WEATHERS.length)]);
    }, 300000);
    return () => clearInterval(t);
  }, []);

  return {
    time: now.toLocaleTimeString("zh-CN", { hour12: false }),
    date: now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }),
    hour: now.getHours(),
    weather,
    season: SEASONS[now.getMonth()],
  };
}
