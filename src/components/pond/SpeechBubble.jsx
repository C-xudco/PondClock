import { FISHER } from "./scene";

// 本地纸墨对白；颜色区分语气，文字始终保留足够对比。
const TONES = {
  idle: {
    bg: "rgba(244,242,230,.96)",
    border: "rgba(83,109,90,.4)",
    text: "#344c43",
    dot: "#708368",
  },
  success: {
    bg: "rgba(234,240,222,.96)",
    border: "rgba(96,126,76,.45)",
    text: "#355237",
    dot: "#70854c",
  },
  high: {
    bg: "rgba(246,237,210,.96)",
    border: "rgba(166,124,64,.5)",
    text: "#795b35",
    dot: "#a5793d",
  },
  miss: {
    bg: "rgba(235,236,225,.96)",
    border: "rgba(108,118,99,.4)",
    text: "#596453",
    dot: "#7d866f",
  },
};

// 对话气泡：锚在斗笠上方，尾巴指向人物；长文本自动换行，最高不越过水塘顶部
const SpeechBubble = ({ speech, placement, sceneStyle = 'inkwash' }) => {
  if (!speech || !speech.text) return null;
  const inkTone = TONES[speech.tone] || TONES.idle;
  const tone = sceneStyle === 'minimal' ? { ...inkTone, bg: 'rgba(20,35,46,.93)', border: 'rgba(167,200,202,.38)', text: '#dce8e6', dot: speech.tone === 'high' ? '#d9ba8a' : '#9bbebb' } : inkTone;
  const b = placement?.bubble || FISHER.bubble;
  // 同一句连续出现时也要重新播放弹出动画：优先用外部给的 id
  const animKey = speech.id != null ? `s-${speech.id}` : `${speech.tone}-${speech.text}`;

  return (
    <div
      className="pond-speech pointer-events-none absolute z-20 flex flex-col justify-end"
      style={{
        left: `${b.left}%`,
        right: `${b.right}%`,
        bottom: `${b.bottom}%`,
        maxHeight: `${b.maxHeight}%`,
      }}
    >
      <div
        key={animKey}
        className="mc-bubble relative min-h-0 overflow-hidden rounded-[10px] border px-2.5 py-1.5 text-[12px] leading-[1.45] shadow-md"
        style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
      >
        <span title={speech.text} style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: b.maxLines || 3, overflow: 'hidden' }}>
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-[1px]"
          style={{ backgroundColor: tone.dot, boxShadow: `0 0 6px ${tone.dot}66` }}
        />
        <span className="align-middle">{speech.text}</span>
        </span>
      </div>
      {/* 小尾巴：指向人物头部 */}
      <span
        className="mc-bubble-tail absolute h-2 w-2 rotate-45 rounded-[1px] border-b border-r"
        style={{
          left: `${b.tailLeft}%`,
          bottom: 0,
          backgroundColor: tone.bg,
          borderColor: tone.border,
        }}
      />
    </div>
  );
};

export default SpeechBubble;
