import { FISHER, ROD_BITE_DEG, PERSON_BITE_DEG, fisherTipAt, bobberTopAt, actorPlacementFor } from "./scene";
import { useTween } from "./useTween";
import { CHARACTER_VISUALS, ROD_VISUALS } from "../../data/appearanceVisuals";

// Original SVG silhouettes, all authored around the shared grip and support point.
// No licensed character, face, hairstyle or game-specific insignia is reproduced.
const Silhouette = ({ skin, rain, snow, p }) => {
  const c = CHARACTER_VISUALS[skin] || CHARACTER_VISUALS.minimal;
  const hood = skin === 'cloudwalker' && !rain;
  return <g data-character-art={skin}>
    <ellipse cx="936" cy="329" rx="25" ry="4" fill={p.ink} opacity=".36" />
    <g fill="none" stroke={c.coat} strokeLinecap="round" strokeLinejoin="round">
      <path d="M907 283L906 316L918 325" strokeWidth="9" />
      <path d="M931 284L938 317L950 325" strokeWidth="10" />
    </g>
    <path d="M902 224Q892 234 887 257L894 290Q919 298 943 288L940 248Q938 229 927 222Z" fill={c.coat}/>
    <path d="M927 224Q931 250 933 282L925 288L916 293Q924 260 919 230Z" fill={c.lining} opacity=".55" />
    <path d="M893 268Q916 273 941 269L941 276Q913 278 891 275Z" fill={c.sash} opacity=".85" />
    <path d="M938 261Q950 262 954 275L952 290L940 289Z" fill={c.lining}/>
    <path d="M939 263q8 -4 14 7" stroke={c.sash} strokeWidth="2" fill="none" />
    <circle cx="916" cy="206" r="10.5" fill={c.coat}/>
    <path d="M917 213L918 226" stroke={c.coat} strokeWidth="10" />
    {hood ? <>
      <path d="M897 216Q888 195 902 181Q920 171 932 187L939 211L927 221L922 202L907 199L907 216Z" fill={c.hat}/>
      <path d="M905 223Q921 218 935 225L954 289Q927 303 884 289L893 250Z" fill={c.coat}/>
      <path d="M917 227L913 279L921 292" stroke={c.trim} strokeWidth="1.8" fill="none" opacity=".55" />
      <path d="M911 225L882 246L860 246" stroke={c.lining} strokeWidth="8" strokeLinecap="round" fill="none" />
    </> : <>
      <path d="M886 195Q902 172 916 169Q934 178 949 192Q922 204 886 195Z" fill={c.hat}/>
      <path d="M886 195Q921 204 949 192" stroke={c.trim} strokeWidth="1.3" fill="none" opacity=".55" />
    </>}
    <path d="M903 234Q889 242 879 243L854 244" stroke={c.coat} strokeWidth="9" strokeLinecap="round" fill="none" />
    <path d="M902 231Q881 240 856 241" stroke={c.trim} strokeWidth="1.1" fill="none" opacity=".4" />
    <circle cx="853" cy="244" r="4" fill={c.hat} />
    {rain && <g data-silhouette-rain-cape="true">
      <path d="M899 222Q921 215 936 226L955 286Q926 298 887 287L891 247Z" fill={c.hat} opacity=".92" />
      <path d="M907 227L895 284M916 225L908 289M925 227L924 290M933 234L940 286" stroke={c.trim} strokeWidth="1.4" opacity=".45" fill="none" />
      <path d="M877 199Q900 173 918 171Q943 180 959 197Q919 210 877 199Z" fill={c.hat}/>
      <path d="M877 199Q919 208 959 197" stroke={c.trim} strokeWidth="1.5" opacity=".55" fill="none"/>
      <path d="M901 236L881 245L854 244" stroke={c.hat} strokeWidth="9" fill="none" strokeLinecap="round" />
    </g>}
    {snow > .001 && <g opacity={snow} fill="#f6f8ed" stroke="#e6eee6" strokeWidth=".7" data-snow-support="hat-shoulder">
      <path d={hood ? "M899 190Q910 175 922 182L931 189L922 187L916 184L909 186Z" : "M890 191Q905 173 917 171Q931 177 943 190L930 188L920 178L911 181L901 189Z"}/>
      <path d="M929 225q9 1 13 12l-9 -5 -8 -1Z" />
    </g>}
  </g>;
};
// Raster body/hat and the existing painted shore provide the figure's support.
// Only a small ink seat accent is added; never paint the water-mask polygon as a flat bank.
const Fisherman = ({
  p,
  pose = 0,
  visualState,
  geometry,
  character = 'minimal',
  rod = 'minimal',
}) => {
  const snowTarget = visualState.fisherman.snowTarget;
  const snow = useTween(snowTarget, snowTarget ? 2600 : 10000);
  const placement = actorPlacementFor(geometry);
  const tip = fisherTipAt(pose, geometry),
    end = bobberTopAt(pose);
  const personDeg = PERSON_BITE_DEG * pose;
  const image = FISHER.image;
  const rain = visualState.fisherman.rainGear;
  const rodColors = ROD_VISUALS[rod] || ROD_VISUALS.minimal;
  return <g pointerEvents="none" data-layer="fisherman" data-actor-offset-y={placement.offsetY} data-rain-gear={rain ? "true" : "false"} data-snow-cover={snow.toFixed(3)}>
    <path d={`M${tip.x} ${tip.y} Q${(tip.x + end.x) / 2 + 2} ${(tip.y + end.y) / 2} ${end.x} ${end.y}`} fill="none" stroke={p.isNight ? "#d4dfd3" : "#344c48"} strokeWidth="1.15" opacity=".9" data-fishing-line="true" data-tip-x={tip.x} data-tip-y={tip.y} />
    <g transform={placement.transform} data-actor-placement="true">
    {character === 'inkwash' && <g data-seat-accent="ink">
      <path d="M886 319l13 -9 18 -5 22 2 16 10 -8 10 -21 6 -27 -2 -16 -5Z" fill="#58645a" opacity=".75" />
      <path d="M895 317l17 -7 20 1 14 7 -20 4 -21 1Z" fill="#c4c3ac" opacity=".7" />
      <path d="M892 325l14 -7 14 -2 M932 324l13 -3" fill="none" stroke="#374d40" strokeWidth="1.2" opacity=".6" />
    </g>}
    <g transform={`rotate(${personDeg} ${FISHER.x} ${FISHER.seatY})`}>
      {character === 'inkwash' ? <g data-character-art="inkwash">
      <image href={`${import.meta.env.BASE_URL}art/inkwash/${rain ? "fisherman-rain" : "fisherman"}-v1.png`} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio="none" />
      {snow > .001 && <g opacity={snow} fill="#f6f8ed" stroke="#e6eee6" strokeWidth=".7" data-snow-support="hat-shoulder">
        <path d="M866 173Q879 164 889 164L896 166L905 168L917 171L932 183Q913 176 899 174Q881 172 866 177Z" />
        <path d="M924 201q11 2 15 8l8 10 -12 -4 -8 -5 -8 -2Z" />
        <path d="M953 230l6 9 -8 -4 -4 -5Z" opacity=".75" />
      </g>}
      </g> : <Silhouette skin={character} rain={rain} snow={snow} p={p}/>}
      <g transform={`rotate(${ROD_BITE_DEG * pose} ${FISHER.grip.x} ${FISHER.grip.y})`} data-rod-art={rod}>
        <path d="M860 249Q711 151 575 128" fill="none" stroke={rodColors.body} strokeWidth="3.1" strokeLinecap="round" />
        <path d="M851 243Q708 149 575 128" fill="none" stroke={rodColors.highlight} strokeWidth=".85" />
        <g stroke={rodColors.wrap} fill="none" strokeWidth="1"><circle cx="810" cy="219" r="2" /><circle cx="747" cy="184" r="1.8" /><circle cx="676" cy="154" r="1.4" /><circle cx="596" cy="132" r="1.2" /></g>
        {(rod === 'jade' || rod === 'dawn') && <path d="M831 228l-3 5M816 219l-3 5M762 188l-2 4M692 157l-1 3" fill="none" stroke={rodColors.wrap} strokeWidth="2.6" strokeLinecap="round"/>}
      </g>
    </g>
    </g>
  </g>;
};
export default Fisherman;
