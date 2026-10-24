import { STARS } from "./scene";
// No celestial object or direct-light reflection is baked into the landscape.
const SkyLayer = ({
  visualState: v,
  geometry,
  uid
}) => {
  const night = v.daylight.isDay === false;
  const overcast = v.sky.coverage === "overcast";
  const clouds = v.sky.coverage === "partly-cloudy" || overcast;
  const {
    x,
    y
  } = geometry.celestial;
  return <g pointerEvents="none" data-layer="sky">
    <defs>
      <radialGradient id={`${uid}-celestial`}><stop stopColor={night ? "#edf1e5" : "#f4dfab"} stopOpacity=".66" /><stop offset="1" stopColor="#f2ede2" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${uid}-cloud`} x2="0" y2="1"><stop stopColor="#626e72" stopOpacity={overcast ? ".62" : ".28"} /><stop offset="1" stopColor="#bac1bd" stopOpacity="0" /></linearGradient>
      <linearGradient id={`${uid}-fog`} x2="0" y2="1"><stop stopColor="#e1e4de" stopOpacity="0" /><stop offset=".5" stopColor="#e1e4de" stopOpacity=".5" /><stop offset="1" stopColor="#e1e4de" stopOpacity="0" /></linearGradient>
    </defs>
    {night && <rect width="1000" height="440" fill="#12242f" opacity=".61" data-night-wash="true" />}
    {overcast && <rect width="1000" height="440" fill="#55666f" opacity={night ? ".16" : ".2"} />}
    {v.celestial.starsVisible && <g fill="#edf0e5" opacity=".65" data-celestial="stars">{STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} />)}</g>}
    {(v.celestial.sunVisible || v.celestial.moonVisible) && <g data-celestial={v.celestial.sunVisible ? "sun" : "moon"}>
      <ellipse cx={x} cy={y} rx="64" ry="43" fill={`url(#${uid}-celestial)`} />
      <circle cx={x} cy={y} r={night ? 11 : 13} fill={night ? "#ecefe2" : "#f6e8bf"} opacity=".9" />
    </g>}
    {clouds && <g data-cloud-cover={v.sky.coverage}>
      <path d="M-30 23 Q80 -4 170 29 Q264 9 350 35 Q460 0 578 24 Q700 -8 802 28 Q910 4 1030 25 L1030 138 Q870 112 740 125 Q600 95 465 123 Q320 100 190 124 Q80 105 -30 137Z" fill={`url(#${uid}-cloud)`} />
      <path d="M30 82 Q140 50 257 79 M386 66 Q504 34 630 69 M718 94 Q830 60 980 88" stroke="#85928f" strokeWidth="9" opacity=".13" strokeLinecap="round" fill="none" />
    </g>}
    {v.sky.fog && <rect y={geometry.horizonY - 60} width="1000" height="160" fill={`url(#${uid}-fog)`} data-fog="true" />}
  </g>;
};
export default SkyLayer;
