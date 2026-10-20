const WEATHER_KEYS = new Set([
  'latitude', 'longitude', 'current', 'timezone', 'timeformat', 'forecast_days',
  'temperature_unit', 'wind_speed_unit', 'precipitation_unit',
]);
const CURRENT_VARIABLES = new Set([
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'cloud_cover',
  'wind_speed_10m', 'wind_direction_10m',
]);

function validateEnvironmentUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('环境请求地址无效。');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new Error('只允许固定 HTTPS 环境服务。');
  }
  if (url.hostname === 'ipapi.co' && url.pathname === '/json/' && !url.search) return url;
  if (url.hostname !== 'api.open-meteo.com' || url.pathname !== '/v1/forecast') {
    throw new Error('环境服务地址不在白名单。');
  }
  for (const [key] of url.searchParams) {
    if (!WEATHER_KEYS.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error('天气查询参数无效。');
  }
  for (const [key, min, max] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
    const raw = url.searchParams.get(key);
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < min || value > max) throw new Error('天气坐标无效。');
  }
  const variables = url.searchParams.get('current');
  if (!variables || variables.split(',').some((value) => !CURRENT_VARIABLES.has(value))) {
    throw new Error('天气字段无效。');
  }
  const choices = {
    timezone: /^(auto|UTC|GMT|Asia\/Shanghai)$/,
    timeformat: /^(iso8601|unixtime)$/,
    forecast_days: /^[1-3]$/,
    temperature_unit: /^(celsius|fahrenheit)$/,
    wind_speed_unit: /^(kmh|ms|mph|kn)$/,
    precipitation_unit: /^(mm|inch)$/,
  };
  for (const [key, pattern] of Object.entries(choices)) {
    const value = url.searchParams.get(key);
    if (value !== null && !pattern.test(value)) throw new Error('天气查询参数值无效。');
  }
  return url;
}

async function requestEnvironment(input, fetchImplementation = fetch) {
  const url = validateEnvironmentUrl(input);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 8000);
  let reader;
  try {
    const response = await fetchImplementation(url.href, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
      redirect: 'error', credentials: 'omit', cache: 'no-store',
    });
    if (!response.ok) throw new Error(`环境服务暂不可用（HTTP ${response.status}）。`);
    if (!response.body) throw new Error('环境服务返回空响应。');
    reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) throw new Error('环境服务响应过大。');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('环境服务未返回有效 JSON。'); }
  } finally {
    clearTimeout(deadline);
    if (reader) await reader.cancel().catch(() => {});
  }
}

module.exports = { requestEnvironment, validateEnvironmentUrl };
