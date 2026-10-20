import { useCallback, useEffect, useState } from "react";
import { DEFAULT_REGION } from "@/lib/gameConfig";
import { browserStorage, fetchGeo, readGeoCache, writeGeoCache } from "@/services/environment";

const pending = () => ({ regionId: null, source: "pending", detail: "", cached: false });
const disabled = () => ({ regionId: DEFAULT_REGION, source: "disabled", detail: "本地模式", cached: false });

// Every enabled startup asks the current public IP again (VPNs are accepted).
// Cached results never use "ip", so they cannot grant a new real visit.
export function useGeoRegion(online = true) {
  const [state, setState] = useState(() => ({ enabled: online, value: online ? pending() : disabled() }));
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => { if (online) setAttempt((value) => value + 1); }, [online]);

  useEffect(() => {
    const publish = (value) => setState({ enabled: online, value });
    if (!online) {
      const cached = readGeoCache(browserStorage());
      publish(cached ? { ...cached, regionId: DEFAULT_REGION, source: "disabled" } : disabled());
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    publish(pending());
    fetchGeo({ signal: controller.signal })
      .then((next) => {
        if (!active) return;
        writeGeoCache(browserStorage(), next);
        publish(next);
      })
      .catch(() => {
        if (!active) return;
        publish(readGeoCache(browserStorage())
          || { regionId: DEFAULT_REGION, source: "fallback", detail: "暂未定位，使用默认水域", cached: false });
      });
    return () => { active = false; controller.abort(); };
  }, [online, attempt]);

  // The parent sees pending immediately when enabling network after loading a save,
  // rather than briefly initializing a new game from the prior disabled default.
  const geo = online ? (state.enabled ? state.value : pending())
    : { ...state.value, regionId: DEFAULT_REGION, source: "disabled" };
  return { ...geo, refresh };
}
