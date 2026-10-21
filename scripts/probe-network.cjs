// Explicit one-shot consent gate. Never print/store the response, IP, location,
// URLs with coordinates, errors with proxy credentials, or the game profile.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
if (process.env.POND_REAL_NETWORK_CONSENT !== 'ipwhois-weather-once') {
  throw new Error('This real-network probe requires explicit one-shot consent.');
}
if (!process.versions.electron) {
  const directory = fs.mkdtempSync(path.join(root, 'test-results', 'real-network-'));
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env, POND_NETWORK_REPORT_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), ['--no-sandbox', __filename], {
    cwd: root, env, windowsHide: true, timeout: 30000, stdio: 'ignore',
  });
  const reportPath = path.join(directory, 'network-probe.json');
  if (!fs.existsSync(reportPath)) {
    fs.writeFileSync(reportPath, JSON.stringify({ version: require('../package.json').version,
      checkedAt: new Date().toISOString(), passed: false, transport: 'Electron diagnostic',
      hostSandboxEnabled: false, launchStatus: result.error?.code || result.status, checks: [] }, null, 2));
  }
  console.log(JSON.stringify({ reportPath, ...JSON.parse(fs.readFileSync(reportPath, 'utf8')) }));
  process.exitCode = result.status === 0 ? 0 : 1;
} else {
  const { app, session, net } = require('electron');
  const { pathToFileURL } = require('node:url');
  const directory = process.env.POND_NETWORK_REPORT_DIR;
  if (!directory || path.dirname(directory) !== path.join(root, 'test-results')) throw new Error('Invalid probe directory');
  app.setPath('userData', path.join(directory, 'profile'));
  const report = { version: require('../package.json').version, checkedAt: new Date().toISOString(), passed: false,
    transport: 'Electron Chromium stack with product allowlist, bounded response and dedicated location session',
    hostSandboxEnabled: false, scope: 'One real IPWhois lookup and one Open-Meteo request using returned coordinates; no actual VPN switching or friend-machine validation.', checks: [] };
  const code = (error) => Number.isInteger(error?.status) ? `HTTP_${error.status}`
    : error?.code === 'ENV_TIMEOUT' ? 'TIMEOUT' : error?.name === 'EnvironmentError' ? 'INVALID_RESPONSE' : 'NETWORK_ERROR';
  app.whenReady().then(async () => {
    const { GEO_PROVIDERS } = require('../src/config/environmentEndpoints.cjs');
    const { createEnvironmentService } = require('../desktop/environment.cjs');
    const { createGeoNetworkFetch } = require('../desktop/environmentNetwork.cjs');
    const { parseGeoResponse, validCoordinates, fetchWeather, weatherLocation } = await import(pathToFileURL(path.join(root, 'src/services/environment.js')).href);
    const locationFetch = createGeoNetworkFetch(session.fromPartition('pondclock-location', { cache: false }));
    let geo;
    let began = Date.now();
    try {
      const payload = await createEnvironmentService({ timeoutMs: 4500 })(GEO_PROVIDERS[1].url, locationFetch);
      geo = parseGeoResponse(payload, 'ipwhois');
      report.checks.push({ service: 'IPWhois', success: true, code: 'OK', mappedWaterRegion: geo.source === 'ip',
        coordinatesValid: validCoordinates(geo.latitude, geo.longitude), durationMs: Date.now() - began });
    } catch (error) { report.checks.push({ service: 'IPWhois', success: false, code: code(error), durationMs: Date.now() - began }); }
    if (geo && validCoordinates(geo.latitude, geo.longitude)) {
      began = Date.now();
      try {
        await fetchWeather(weatherLocation(geo.regionId, geo), {
          requestJson: (url) => createEnvironmentService({ timeoutMs: 6000 })(url, (input, init) => net.fetch(input, init)),
        });
        report.checks.push({ service: 'Open-Meteo', success: true, code: 'OK', durationMs: Date.now() - began });
      } catch (error) { report.checks.push({ service: 'Open-Meteo', success: false, code: code(error), durationMs: Date.now() - began }); }
    } else report.checks.push({ service: 'Open-Meteo', success: false, code: 'SKIPPED_NO_IP_COORDINATES' });
    report.passed = report.checks.every((check) => check.success);
  }).catch(() => { report.fatalCode = 'PROBE_FAILED'; }).finally(() => {
    fs.writeFileSync(path.join(directory, 'network-probe.json'), JSON.stringify(report, null, 2) + '\n');
    app.exit(report.passed ? 0 : 1);
  });
}
