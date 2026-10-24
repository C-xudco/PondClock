import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { sceneSiteForRegion } from "@/data/sceneSites";
import { sceneDefinitionForRegion } from "@/config/sceneDefinitions";
import { getRegionWeatherStore, sceneWeatherTargetKey, weatherErrorMessage } from "@/services/regionWeatherStore";
import { displayWeather } from "@/services/weatherSnapshot";
import { toWeatherVisualState } from "@/domain/weatherVisualState";

/** Read-only view; this hook has no game command, unlock or travel authority. */
export function useRegionWeather(regionId, online = true, { priority = "scene" } = {}) {
  const store = useMemo(() => getRegionWeatherStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const site = sceneSiteForRegion(regionId);
  const sceneDefinition = sceneDefinitionForRegion(site.regionId);
  const entry = state.entries[sceneWeatherTargetKey(site)];
  const snapshot = entry.snapshot;
  const refreshWeather = useCallback(() => store.refreshRegion(site.regionId, "manual"), [store, site.regionId]);
  useEffect(() => {
    if (priority === "viewer") store.setViewerRegion(site.regionId);
    else if (priority === "destination") store.setDestinationRegion(site.regionId);
    else store.setCurrentRegion(site.regionId);
    return () => {
      if (priority === "viewer") store.setViewerRegion(null);
      if (priority === "destination") store.setDestinationRegion(null);
    };
  }, [store, site.regionId, priority]);
  return {
    site, sceneSite: site, sceneDefinition, entry, weatherEntry: entry, snapshot,
    visualState: toWeatherVisualState(snapshot, { timeZone: site.timeZone }),
    weather: displayWeather(snapshot.weatherCode), temperature: snapshot.temperatureC,
    weatherPlace: site.place, weatherSource: snapshot.source, weatherUpdatedAt: snapshot.observedAtMs,
    weatherFetchedAtMs: snapshot.fetchedAtMs, weatherErrorCode: online ? entry.errorCode : null,
    weatherError: online ? weatherErrorMessage(entry.errorCode) : null,
    weatherRefreshing: online && ["queued", "refreshing"].includes(entry.status),
    weatherLastAttemptAtMs: entry.lastAttemptAtMs, weatherRetryAtMs: entry.retryAtMs,
    refreshWeather,
  };
}
