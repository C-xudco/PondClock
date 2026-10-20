// Web 预览用的"桌面壁纸"底层。
// 作用：让水塘天空的半透明效果能被看出来（真实桌面端应删除本组件，
// 改用 Electron/Tauri 的透明无边框窗口，让系统桌面透出来）。
const DesktopBackdrop = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#080d14]">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_22%,rgba(62,96,118,0.5),transparent_55%),radial-gradient(ellipse_at_82%_8%,rgba(122,88,70,0.32),transparent_52%),radial-gradient(ellipse_at_50%_105%,rgba(24,40,55,0.85),transparent_62%)]" />
    <div className="absolute -left-28 top-1/4 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />
    <div className="absolute -right-20 -top-16 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,12,0.15),rgba(2,6,12,0.55))]" />
  </div>
);

export default DesktopBackdrop;
