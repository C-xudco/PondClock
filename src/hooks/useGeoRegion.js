import { useEffect, useState } from "react";
import { DEFAULT_REGION } from "@/lib/gameConfig";
import { regionForProvince } from "@/lib/gameUtils";

const GEO_URL = "https://ipapi.co/json/";
const CACHE_KEY = "pondclock.geo";
const TIMEOUT_MS = 4500;

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.regionId ? data : null;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式 / 存储被禁用时静默忽略
  }
};

// IP 属地自动跟随：只识别中国省级行政区并映射到 12 个水域之一。
// 请求失败/超时/境外网络时优雅降级为默认水域（不影响游戏），结果缓存到本地。
export function useGeoRegion() {
  const [geo, setGeo] = useState(() => {
    const cached = readCache();
    return cached
      ? { ...cached, cached: true }
      : { regionId: null, source: "pending", detail: "" };
  });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    fetch(GEO_URL, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        if (!alive) return;
        const isCN = data?.country_code === "CN";
        const regionId = isCN
          ? regionForProvince(data.region, data.region_code, data.city, data.country_name)
          : null;
        const next = regionId
          ? { regionId, source: "ip", detail: data.region || data.city || "" }
          : {
              regionId: DEFAULT_REGION,
              source: isCN ? "default" : "oversea",
              detail: isCN ? "未能匹配到水域" : data.country_name || "境外网络",
            };
        setGeo({ ...next, cached: false });
        writeCache(next);
      })
      .catch(() => {
        if (!alive) return;
        // 已有缓存时保留缓存区域，否则退回默认水域
        setGeo((prev) =>
          prev.regionId
            ? { ...prev, source: prev.source === "ip" ? "ip-cached" : prev.source, detail: prev.detail }
            : { regionId: DEFAULT_REGION, source: "fallback", detail: "定位失败，默认水域" }
        );
      })
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return geo;
}
