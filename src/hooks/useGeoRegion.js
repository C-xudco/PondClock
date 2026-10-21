import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_REGION } from "@/lib/gameConfig";
import {
  bindGeoRefreshTriggers, browserStorage, createGeoRefreshController, initialGeoState,
} from "@/services/environment";

const disabled = () => ({ ...initialGeoState(), regionId: DEFAULT_REGION,
  source: "disabled", detail: "本地模式", refreshing: false, error: null, retryAtMs: 0 });

// Cached/default data is usable immediately. Only a fresh `source: ip` result
// grants a real visit; requests never block game initialization or asset writes.
export function useGeoRegion(online = true) {
  const [state, setState] = useState(() => ({ enabled: online,
    value: online ? initialGeoState() : disabled() }));
  const active = useRef(null);
  const refresh = useCallback(() => active.current?.refresh("manual") || Promise.resolve(), []);

  useEffect(() => {
    if (!online) {
      setState({ enabled: false, value: disabled() });
      return undefined;
    }
    const controller = createGeoRefreshController({ storage: browserStorage(),
      onChange: (value) => setState({ enabled: true, value }) });
    active.current = controller;
    setState({ enabled: true, value: controller.getState() });
    const stop = bindGeoRefreshTriggers(controller);
    return () => { active.current = null; stop(); };
  }, [online]);

  const geo = online ? (state.enabled ? state.value : initialGeoState()) : disabled();
  return { ...geo, refresh };
}
