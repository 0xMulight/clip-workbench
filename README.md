# 片段工作台 / Clip Workbench

在浏览器里按时间戳把视频切成 5 到 60 秒片段，打开就能用，无需安装 Python 或 FFmpeg。

**网页版（推荐）：** [https://0xMulight.github.io/clip-workbench/](https://0xMulight.github.io/clip-workbench/)

公开网页的源码在 `docs/` 目录，由 GitHub Pages 从 `main` 分支的这个目录发布。

这不是 X 的官方产品，也不能替代 App 里的「剪辑视频」。切出来的是普通 MP4，发到 X 上不会自动带「Clip from」署名和回流。如果你要官方剪辑，用这里对好时间，再回到手机 App 里剪。

## 网页版怎么用

1. 打开上面的页面，上传一段本地视频（常见的 MP4、WebM 等即可）。
2. 填写开始 / 结束时间（支持 `ss`、`mm:ss`、`hh:mm:ss`），或点「加载示例配方」填入现成时间戳。示例不会附带视频，仍需你自己上传原片。
3. 点「开始剪辑」。首次使用会在浏览器里下载约 32 MB 的剪辑引擎，页面会显示进度。
4. 在结果里预览并下载片段。

片段短于 5 秒、长于 60 秒，或超过原片的 30% 时，页面会提醒——这是 X 官方「剪辑视频」的规则，不是本工具自己的评分。即便有提醒，仍会按你给的时间切出文件。

视频只在你的浏览器里处理，不会上传到服务器。公开网页**不接受**粘贴 X / Twitter 链接代为拉视频。请只处理你有权使用、或准备引用原作者的视频。

## 本机版：仍可粘贴推特链接

如果你想粘贴 `x.com` / `twitter.com` 帖子链接并在自己的电脑上拉取原片，可以用仓库里的 Python 工具。拉取和剪辑都在本机完成，不会把视频上传到第三方。

### Windows 10 最省事的用法

1. 安装 [Python 3.10+](https://www.python.org/downloads/)，安装时勾选 **Add python.exe to PATH**。
2. 安装 [FFmpeg](https://www.gyan.dev/ffmpeg/builds/)，把里面带 `ffmpeg.exe` 和 `ffprobe.exe` 的 `bin` 目录加到系统 PATH。装完后关掉并重新打开窗口。
3. 在 GitHub 下载本仓库的 ZIP 并解压，或先克隆再打开文件夹。
4. 双击 **`启动工作台.bat`**。第一次会自动安装 `yt-dlp`，然后打开浏览器里的 `http://127.0.0.1:8765/`。

更细的安装说明见 [docs/windows-guide.md](docs/windows-guide.md)。

### 命令行（macOS / Linux，或你更习惯终端时）

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

浏览器打开 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)。本机需要已安装 `ffmpeg` 和 `ffprobe`。

## 还没有做的

自动从任意视频里找出「最有传播潜力」的片段，还不在这一版。你可以先自己填时间戳，或点「加载示例配方」用现成的示例。后面如果加自动分析，也会继续只在本地 / 浏览器里运行。

## 许可

MIT License。Copyright (c) 2026 0xMulight。

网页版的剪辑引擎使用 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)（MIT），并选用官方单线程核心，以便在无法设置 COOP/COEP 的 GitHub Pages 上运行。
