const WaterLayer = ({
  visualState,
  geometry,
  uid
}) => {
  const {
    x
  } = geometry.celestial;
  return <g pointerEvents="none" data-layer="water" clipPath={`url(#${uid}-water)`}>
    {visualState.celestial.reflectionVisible && <g data-celestial="reflection" opacity=".27">
      {Array.from({
        length: 16
      }, (_, i) => <path key={i} d={`M ${x - 4 - i * 2.4} ${geometry.horizonY + 12 + i * 12} q ${10 + i * 3.6} -2 ${20 + i * 5.2} 0`} fill="none" stroke={visualState.celestial.directLightVisible ? "#eddfb2" : "#dbe4dc"} strokeWidth={1 + i / 14} />)}
    </g>}
    <g fill="none" stroke={visualState.daylight.isDay === false ? "#a1b7b5" : "#546f71"} strokeWidth=".8" opacity=".14">
      <path d="M48 287q83 -3 147 1 M218 393q94 -4 173 1 M404 254q50 -2 92 0 M604 414q57 -3 101 0" />
    </g>
  </g>;
};
export default WaterLayer;
