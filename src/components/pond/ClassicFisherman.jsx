import { useId } from 'react';
import { ROD_VISUALS } from '../../data/appearanceVisuals';
import {
  FISHER,
  ROD_BITE_DEG,
  PERSON_BITE_DEG,
  fisherTipAt,
  bobberTopAt,
} from "./classicScene";

// 剪影渔人：斗笠 + 长衫，侧身面向左边，站在右岸岸上，竹竿伸向左上
const ClassicFisherman = ({ p, pose = 0, geometry, rain, snow, rod = 'minimal' }) => {
  const uid = 'classic-' + useId().replace(/[^a-z0-9]/gi, '');
  const offset = geometry.id.startsWith('minimal-') ? {x:0,y:0} : {x:74,y:83+(geometry.actorOffsetY||0)};
  const rodColor = rod === 'minimal' ? p.ink : ROD_VISUALS[rod]?.body || p.ink;
  const personDeg = PERSON_BITE_DEG * pose; // 咬钩时前倾
  const rodDeg = ROD_BITE_DEG * pose; // 咬钩时竿梢下压
  const tip = fisherTipAt(pose);
  const rawEnd = bobberTopAt(pose);
  const lineEnd = {x:rawEnd.x-offset.x,y:rawEnd.y-offset.y};
  const sag = 1.1 + 2.4 * pose;

  return (
    <g pointerEvents="none" data-layer="fisherman" data-character-art="minimal" data-classic-source="1.1.1" data-rain-gear={String(rain)} data-snow-cover={snow.toFixed(3)} transform={`translate(${offset.x} ${offset.y})`}>
      <defs>
        <radialGradient id={uid+'-glow'} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.light} stopOpacity="0.4" />
          <stop offset="100%" stopColor={p.light} stopOpacity="0" />
        </radialGradient>
        <filter id={uid+'-foot'} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* 咬钩时人物背后的环境光（点击高亮反馈） */}
      <ellipse
        cx={FISHER.x - 6}
        cy={192}
        rx={78}
        ry={94}
        fill={'url(#'+uid+'-glow)'}
        opacity={0.22 * pose}
      />

      {/* 钓线：从竿梢垂到浮漂顶珠（几乎垂直，只带一点自然弧度） */}
      <path
        data-fishing-line="true"
        data-tip-x={tip.x + offset.x}
        data-tip-y={tip.y + offset.y}
        d={`M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} Q ${(
          (tip.x + lineEnd.x) / 2 + sag
        ).toFixed(2)} ${((tip.y + lineEnd.y) / 2).toFixed(2)} ${lineEnd.x} ${lineEnd.y}`}
        fill="none"
        stroke={p.lightSoft}
        strokeWidth="0.8"
        opacity="0.55"
      />

      <g
        transform={`rotate(${personDeg} ${FISHER.x} ${FISHER.feetY}) translate(${FISHER.x} ${
          FISHER.feetY
        }) scale(${FISHER.scale}) translate(${-FISHER.x} ${-FISHER.feetY})`}
      >
        {/* 岸面投影 */}
        <ellipse
          cx={FISHER.x + 2}
          cy={FISHER.feetY + 1}
          rx="21"
          ry="4.2"
          fill={p.ink}
          opacity="0.55"
        />

        {/* 双腿 + 靴（前腿略弯，站姿更自然） */}
        <g stroke={p.ink} strokeLinecap="round" fill="none">
          <path d="M 852 205 L 848 225 L 845 242" strokeWidth="5.4" strokeLinejoin="round" />
          <path d="M 864 205 L 869 225 L 874 242" strokeWidth="5.8" strokeLinejoin="round" />
        </g>
        <ellipse cx="843" cy="244" rx="4.9" ry="2.1" fill={p.ink} />
        <ellipse cx="876" cy="244" rx="5.2" ry="2.2" fill={p.ink} />

        {/* 长衫（前倾剪影，下摆微张） */}
        <path
          d="M 846 167 C 837 177 833 191 831 206 L 834 215 L 885 215 C 884 197 881 179 876 167 Z"
          fill={p.ink}
        />

        {/* 后腰鱼篓 */}
        <path d="M 883 202 C 895 203 898 211 896 220 L 883 220 Z" fill={p.ink} />
        <ellipse cx="889.5" cy="202" rx="6.6" ry="2.2" fill={p.ink} />

        {/* 持竿手臂：上臂 + 前臂 + 手（手落在竿身上） */}
        <g stroke={p.ink} strokeLinecap="round" fill="none">
          <path d="M 851 172 Q 843 181 843 190" strokeWidth="6.4" />
          <path d="M 843 190 L 834 201" strokeWidth="5.6" />
        </g>
        <circle cx="833" cy="202.5" r="3.2" fill={p.ink} />

        {/* 头 / 斗笠 */}
        <circle cx={FISHER.head.x} cy={FISHER.head.y} r={FISHER.head.r} fill={p.ink} />
        <path d="M 858 163 L 860 171" stroke={p.ink} strokeWidth="6.2" strokeLinecap="round" />
        <path
          d="M 813 155 Q 826 124 848 118 Q 873 123 884 145 Q 849 162 813 155 Z"
          fill={p.ink}
        />

        {rain && <g data-classic-rain-cape="true"><path d="M849 166Q864 166 876 169L890 213Q865 225 832 214L838 187Z" fill={p.ink}/><path d="M849 175L838 211M856 174L850 215M864 176L863 217M872 178L879 213" stroke={p.lightSoft} opacity=".25" fill="none"/></g>}
        {snow>.001 && <g opacity={snow} fill="#edf4ef" data-snow-support="hat-shoulder"><path d="M818 149Q831 125 848 120Q868 125 879 140L863 135L849 126L838 133L828 149Z"/><path d="M868 167Q878 168 882 181L874 176L867 174Z"/></g>}
        {/* 低饱和月光轮廓：提亮剪影边缘，避免糊成一团 */}
        <g fill="none" stroke={p.lightSoft} strokeLinecap="round">
          <path d="M 813 155 Q 826 124 848 118" strokeWidth="1.1" opacity="0.34" />
          <path d="M 813 155 Q 849 162 884 145" strokeWidth="1" opacity="0.2" />
          <path d="M 846 167 C 837 177 833 191 831 206" strokeWidth="1" opacity="0.2" />
          <path d="M 851 172 Q 843 181 843 190" strokeWidth="1" opacity="0.16" />
        </g>

        {/* 竹竿：握竿点绕支点旋转；竿身带自然弧度，梢细根粗 */}
        <g transform={`rotate(${rodDeg} ${FISHER.grip.x} ${FISHER.grip.y})`} data-rod-art={rod}>
          <path d="M 844 203 Q 700 135 575 128 Q 700 142 846 211 Z" fill={rodColor} />
          <path
            d="M 844 203 Q 700 135 575 128"
            fill="none"
            stroke={p.lightSoft}
            strokeWidth="0.7"
            opacity="0.24"
          />
          {/* 竿梢导环 */}
          <circle cx="592" cy="129.2" r="1.6" fill="none" stroke={p.ink} strokeWidth="0.9" />
        </g>

        {/* 绕线轮 */}
        <circle cx="832" cy="209" r="4.2" fill={p.ink} />
        <circle cx="832" cy="209" r="1.5" fill={p.inkSoft} />

        {/* 咬钩时脚下轻高亮（可点击反馈，不做成亮圆环） */}
        {pose > 0.02 && (
          <g>
            <ellipse
              cx={FISHER.x + 1}
              cy={FISHER.feetY - 1.5}
              rx="25"
              ry="5.4"
              fill={p.light}
              opacity={0.1 * pose}
              filter={'url(#'+uid+'-foot)'}
            />
            <ellipse
              cx={FISHER.x + 1}
              cy={FISHER.feetY - 1.5}
              rx="25"
              ry="5.4"
              fill="none"
              stroke={p.light}
              strokeWidth="1"
              opacity={0.22 * pose}
            />
          </g>
        )}
      </g>
    </g>
  );
};

export default ClassicFisherman;
