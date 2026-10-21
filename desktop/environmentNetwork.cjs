// Only the location session is reset. Weather requests and the local renderer
// keep their own connections; no system proxy settings are changed.
function createGeoNetworkFetch(locationSession) {
  return async function fetchCurrentLocation(input, init) {
    const check = () => {
      if (init?.signal?.aborted) throw Object.assign(new Error('定位请求已取消。'), { name: 'AbortError' });
    };
    check();
    await locationSession.forceReloadProxyConfig();
    check();
    await locationSession.closeAllConnections();
    check();
    return locationSession.fetch(input, init);
  };
}

module.exports = { createGeoNetworkFetch };
