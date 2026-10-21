// One exact allowlist shared by the desktop bridge and renderer adapter.
const GEO_PROVIDERS = Object.freeze([
  Object.freeze({ id: 'ipapi', url: 'https://ipapi.co/json/' }),
  Object.freeze({ id: 'ipwhois', url: 'https://ipwho.is/?fields=success,message,country,country_code,region,region_code,city,latitude,longitude' }),
]);

function isGeoUrl(input) {
  try {
    const url = new URL(input);
    return !url.username && !url.password && !url.hash && !url.port
      && GEO_PROVIDERS.some((provider) => provider.url === url.href);
  } catch { return false; }
}

module.exports = { GEO_PROVIDERS, isGeoUrl };
