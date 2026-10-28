// Original vector scenery: geographic motifs, never fixed sunshine or rain.
export default function RegionalLandmark({ regionId, p, ink = false }) {
  const stroke = ink ? '#465e54' : p.inkSoft;
  const fill = ink ? '#82998b' : p.mountainMid || p.inkSoft;
  return <g data-region-landmark={regionId} fill="none" stroke={stroke} opacity={ink ? .7 : .48} strokeLinejoin="round">
    {regionId === 'taihu' && <><path d="M25 174Q65 151 80 168L96 139L108 163L131 155L158 174Z" fill={fill}/><path d="M320 210h42l-12 8h-20Z" fill={stroke}/><path d="M340 176v34l-2-31-15 25h15M343 182l16 21h-16" fill={fill}/></>}
    {regionId === 'dongting' && <><path d="M200 174Q293 132 367 155Q418 157 449 175Z" fill={fill}/><path d="M37 184l-4-41m9 42 5-36m-13 26-11-17m24 16 11-16M71 190l3-35"/><path d="M285 152h25m-21-4h17m-19 4 3-7h13l4 7m-16 0v8m12-8v8"/></>}
    {regionId === 'jialing' && <><path d="M0 176L48 102L111 149L181 84L257 152L322 123L404 177Z" fill={fill} opacity=".6"/><path d="M34 171v-23h60v23m-65-24 34-15 37 15m-27 0v25m77-2v-32h61v32m-66-32 36-16 36 16"/></>}
    {regionId === 'baiyangdian' && <><path d="M34 181l-4-48m8 48 3-43m3 44 12-35m-25 21-13-15m25 17 16-18m-7 31 11-29m11 31 7-44m0 20 12-15"/><ellipse cx="175" cy="203" rx="20" ry="3" fill={fill}/><ellipse cx="219" cy="216" rx="13" ry="3" fill={fill}/><path d="M490 178q32-28 70 0Z" fill={fill}/></>}
    {regionId === 'jiaodong' && <><path d="M80 177Q134 137 181 157Q223 149 251 175Z" fill={fill}/><path d="M159 151v-20h10v20m-13-20h16l-8-7Z" fill={stroke}/><path d="M302 207q19 6 38 0m35 21q26 5 54-1m58-28q23 6 46 0M380 117q8-8 16 0 8-8 16 0"/></>}
  </g>;
}
