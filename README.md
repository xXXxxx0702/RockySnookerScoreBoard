# Rocky Snooker Scoreboard

斯诺克记分牌 PWA，用于手机、平板或桌面浏览器上的横屏比赛记分。应用专注于比赛现场的快速操作：点击球加分、犯规罚分、自由球、换人、撤销/重做，以及局分和整场比赛状态管理。

## 功能

- 双人斯诺克比赛记分
- 当前击球方、单杆分、总分和局数显示
- 红球和彩球阶段自动跟踪
- 台面剩余分数和超分提示
- 犯规罚分快捷按钮：4、5、6、7 分
- 自由球模式
- 自定义加分或罚分数字键盘
- 换人、撤销、重做
- 结束本局、重置当前局、重置整场比赛
- 平局后重摆黑球胜者选择
- BO3 到 BO19 赛制选择
- 球员姓名编辑，支持较长英文姓名
- 本地持久化，刷新页面后保留当前比赛进度
- PWA 支持，可安装到设备并离线打开已缓存版本

## 技术栈

- React 18
- Vite 6
- vite-plugin-pwa
- CSS Grid / Flexbox
- localStorage

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认开发地址通常是：

```text
http://localhost:5173
```

生产构建：

```bash
npm run build
```

本地预览生产构建：

```bash
npm run preview
```

预览端口在 `package.json` 中配置为 `4173`：

```text
http://localhost:4173
```

## 使用方式

1. 横屏打开应用。
2. 点击球员姓名可以编辑双方姓名。
3. 点击红球或彩球给当前击球方加分。
4. 使用 `Foul` 区域给对手加罚分。
5. 使用 `换人` 结束当前单杆并切换击球方。
6. 使用 `自由球` 后，下一次进球会按当前目标球规则计分。
7. 如误操作，可使用撤销/重做。
8. 点击右上角菜单可以调整赛制、红球数、强制进入彩球阶段，或结束/重置比赛。

## PWA

项目使用 `vite-plugin-pwa` 生成 Service Worker 和 Web App Manifest。生产构建后会在 `dist/` 中生成：

- `manifest.webmanifest`
- `sw.js`
- Workbox 运行时代码
- 静态资源缓存清单

安装体验依赖浏览器和系统支持。移动端建议使用 HTTPS 部署，以确保 PWA 安装和 Service Worker 正常工作。

## 项目结构

```text
.
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

## 开发说明

- 主要业务逻辑在 `src/App.jsx` 中，包括记分状态、撤销/重做、局分判断和弹窗流程。
- 主要视觉布局在 `src/styles.css` 中，界面按横屏固定比例设计，并通过缩放适配不同屏幕。
- 当前应用没有后端服务，比赛数据保存在浏览器 `localStorage` 中。
- PWA 配置在 `vite.config.js` 中。

## 构建产物

`npm run build` 会输出到 `dist/`。这个目录可以部署到任意静态站点服务，例如 Nginx、GitHub Pages、Cloudflare Pages、Vercel 或 Netlify。

如果部署到子路径，需要同步配置 Vite 的 `base`、PWA manifest 的 `start_url` 和 `scope`。

## License

当前仓库未声明许可证。
