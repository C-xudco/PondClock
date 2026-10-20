import { FISHER } from "./scene";

// 语气皮肤：低饱和、与剪影夜景统一，避免亮色大色块
const TONES = {
  idle: {
    bg: "rgba(13,21,31,.82)",
    border: "rgba(150,178,200,.22)",
    text: "#dbe7f1",
    dot: "#8fa9bd",
  },
  success: {
    bg: "rgba(22,29,24,.86)",
    border: "rgba(168,200,146,.3)",
    text: "#e6edda",
    dot: "#a4c987",
  },
  high: {
    bg: "rgba(37,28,21,.88)",
    border: "rgba(228,182,110,.38)",
    text: "#f4e6ca",
    dot: "#e3b46e",
  },
  miss: {
    bg: "rgba(25,29,34,.78)",
    border: "rgba(146,160,174,.2)",
    text: "#a9b5c1",
    dot: "#7f8d9a",
  },
};

// 对话气泡：锚在斗笠上方，尾巴指向人物；长文本自动换行，最高不越过水塘顶部
const SpeechBubble = ({ speech }) => {
  if (!speech || !speech.text) return null;
  const tone = TONES[speech.tone] || TONES.idle;
  const b = FISHER.bubble;
  // 同一句连续出现时也要重新播放弹出动画：优先用外部给的 id
  const animKey = speech.id != null ? `s-${speech.id}` : `${speech.tone}-${speech.text}`;

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{
        left: `${b.left}%`,
        right: `${b.right}%`,
        bottom: `${b.bottom}%`,
        maxHeight: `${b.maxHeight}%`,
      }}
    >
      <div
        key={animKey}
        className="mc-bubble relative overflow-hidden rounded-[10px] border px-2.5 py-1.5 text-[11px] leading-[1.45] shadow-[0_8px_20px_rgba(0,0,0,.35)] backdrop-blur-[2px]"
        style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
      >
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-[1px]"
          style={{ backgroundColor: tone.dot, boxShadow: `0 0 6px ${tone.dot}66` }}
        />
        <span className="align-middle">{speech.text}</span>
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
