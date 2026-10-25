import { useMemo } from 'react';
import { selectSceneWeather } from '@/domain/weatherPresentation';

/** Compose existing weather streams without adding another subscription/request. */
export function useSceneWeather(settings, localWeather, fishingWeather, nowMs) {
  return useMemo(() => selectSceneWeather({ settings, localWeather, fishingWeather, nowMs }),
    [settings, localWeather, fishingWeather, nowMs]);
}
