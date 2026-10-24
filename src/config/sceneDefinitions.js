import { SCENE_SITES } from "../data/sceneSites.js";

export const SCENE_DEFINITIONS = Object.freeze(Object.fromEntries(Object.values(SCENE_SITES).map((site) => [
  site.regionId, Object.freeze({ sceneId: site.sceneId, regionId: site.regionId, siteId: site.siteId,
    revision: 1, viewBox: Object.freeze({ width: 1000, height: 440 }), geometryId: site.regionId, layers: Object.freeze([]) }),
])));
export const sceneDefinitionForRegion = (regionId) => SCENE_DEFINITIONS[regionId] || SCENE_DEFINITIONS.jiangnan;
