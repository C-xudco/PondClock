import { FISHER, ROD_BITE_DEG, PERSON_BITE_DEG, fisherTipAt, bobberTopAt, actorPlacementFor } from "./scene";
import { useTween } from "./useTween";
// Raster body/hat and the existing painted shore provide the figure's support.
// Only a small ink seat accent is added; never paint the water-mask polygon as a flat bank.
const Fisherman = ({
  p,
  pose = 0,
  visualState,
  geometry
}) => {
  const snowTarget = visualState.fisherman.snowTarget;
  const snow = useTween(snowTarget, snowTarget ? 2600 : 10000);
  const placement = actorPlacementFor(geometry);
  const tip = fisherTipAt(pose, geometry),
    end = bobberTopAt(pose);
  const personDeg = PERSON_BITE_DEG * pose;
  const image = FISHER.image;
  const rain = visualState.fisherman.rainGear;
  return <g pointerEvents="none" data-layer="fisherman" data-actor-offset-y={placement.offsetY} data-rain-gear={rain ? "true" : "false"} data-snow-cover={snow.toFixed(3)}>
    <path d={`M${tip.x} ${tip.y} Q${(tip.x + end.x) / 2 + 2} ${(tip.y + end.y) / 2} ${end.x} ${end.y}`} fill="none" stroke={p.isNight ? "#d4dfd3" : "#344c48"} strokeWidth="1.15" opacity=".9" data-fishing-line="true" data-tip-x={tip.x} data-tip-y={tip.y} />
    <g transform={placement.transform} data-actor-placement="true">
    <g data-seat-accent="ink">
      <path d="M886 319l13 -9 18 -5 22 2 16 10 -8 10 -21 6 -27 -2 -16 -5Z" fill="#58645a" opacity=".75" />
      <path d="M895 317l17 -7 20 1 14 7 -20 4 -21 1Z" fill="#c4c3ac" opacity=".7" />
      <path d="M892 325l14 -7 14 -2 M932 324l13 -3" fill="none" stroke="#374d40" strokeWidth="1.2" opacity=".6" />
    </g>
    <g transform={`rotate(${personDeg} ${FISHER.x} ${FISHER.seatY})`}>
      <image href={`${import.meta.env.BASE_URL}art/inkwash/${rain ? "fisherman-rain" : "fisherman"}-v1.png`} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio="none" />
      {snow > .001 && <g opacity={snow} fill="#f6f8ed" stroke="#e6eee6" strokeWidth=".7" data-snow-support="hat-shoulder">
        <path d="M866 173Q879 164 889 164L896 166L905 168L917 171L932 183Q913 176 899 174Q881 172 866 177Z" />
        <path d="M924 201q11 2 15 8l8 10 -12 -4 -8 -5 -8 -2Z" />
        <path d="M953 230l6 9 -8 -4 -4 -5Z" opacity=".75" />
      </g>}
      <g transform={`rotate(${ROD_BITE_DEG * pose} ${FISHER.grip.x} ${FISHER.grip.y})`}>
        <path d="M860 249Q711 151 575 128" fill="none" stroke="#283b33" strokeWidth="3.1" strokeLinecap="round" />
        <path d="M851 243Q708 149 575 128" fill="none" stroke="#859484" strokeWidth=".85" />
        <g stroke="#172e29" fill="none" strokeWidth="1"><circle cx="810" cy="219" r="2" /><circle cx="747" cy="184" r="1.8" /><circle cx="676" cy="154" r="1.4" /><circle cx="596" cy="132" r="1.2" /></g>
      </g>
    </g>
    </g>
  </g>;
};
export default Fisherman;
