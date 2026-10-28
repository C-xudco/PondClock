# 第三方组件与素材说明

本文件区分项目许可和原有第三方许可。不能把项目的非商业限制套用到第三方已经独立许可的组件；也不能把依赖库的MIT许可理解成所有项目插画均可商用。

| 组件/材料 | 位置/来源 | 处理 |
| --- | --- | --- |
| React、React DOM、Vite、Tailwind等 | package.json、pnpm-lock.yaml | 保留上游版权/许可证；安装时依锁文件取得各自包内LICENSE |
| Radix、shadcn风格UI组件、lucide-react | src/components/ui、package依赖 | UI模板不作为本项目独占原创；上游分别见Radix、shadcn/ui和lucide官方仓库，具体版本以锁文件为准 |
| Electron | node_modules/electron、Windows运行目录 | ZIP保留LICENSE.electron.txt |
| Chromium及其第三方组成 | Electron运行目录 | ZIP保留LICENSES.chromium.html；不能删掉后只分发EXE |
| NoCode原始项目及构建插件 | 初始提交、vite.config.js、@meituan-nocode/*开发依赖 | 保留来源；尚未取得独立模板权属证明，不声称本项目拥有上游全部代码 |
| IP/天气服务 | src/config/environmentEndpoints.cjs、services.js | ipapi、IPWhois、Open-Meteo；使用时核对服务条款和额度，项目许可不授权其API/数据的其他用途 |
| AI辅助资源 | docs/inkwash/roles/rendering、docs/default-character | 提示词、源图与运行图分开记录；不据此保证排他版权 |
| 用户风格参考图 | 本地参考目录，公开镜像排除原图 | 未有再分发许可，不纳入项目许可 |

上游入口：[React](https://github.com/facebook/react/blob/main/LICENSE)、[Vite](https://github.com/vitejs/vite/blob/main/LICENSE)、[Tailwind](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE)、[Radix](https://github.com/radix-ui/primitives/blob/main/LICENSE)、[shadcn/ui](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)、[lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE)、[Electron](https://github.com/electron/electron/blob/main/LICENSE)。链接用于追溯，不能替代所分发实际版本的许可证。

依赖版本以pnpm-lock.yaml为准。未逐项签发第三方权利保证；商业发行者应对锁定依赖、模板与美术完成适用许可复核。包内许可文件、各包LICENSE与原版权通知应一并保留。
