# 片段工作台 / Clip Workbench

本地网页工具：把 X / Twitter 上的视频按时间戳切成 5 到 60 秒片段，方便预览和下载。

这不是 X 的官方产品，也不能替代 App 里的「剪辑视频」。切出来的是普通 MP4，发到 X 上不会自动带「Clip from」署名和回流。如果你要官方剪辑，用这里对好时间，再回到手机 App 里剪。

## 能做什么

- 粘贴一条带视频的 `x.com` / `twitter.com` 帖子链接，在本机拉取原片。
- 按开始 / 结束时间切出多段预览，并下载。
- 对照 X 官方剪辑规则做提醒：单段 5–60 秒，且不超过原片的 30%。
- 自带一个时间戳配方示例（Dwarkesh Patel 的 *Which AI is the best liar?*）。仓库里**不包含任何视频文件**，需要你自行拉取。

拉取和剪辑都在你自己的电脑上完成，不会把视频上传到第三方。请只处理你有权使用、或准备引用原作者的视频。

## Windows 10 最省事的用法

1. 安装 [Python 3.10+](https://www.python.org/downloads/)，安装时勾选 **Add python.exe to PATH**。
2. 安装 [FFmpeg](https://www.gyan.dev/ffmpeg/builds/)，把里面带 `ffmpeg.exe` 和 `ffprobe.exe` 的 `bin` 目录加到系统 PATH。装完后关掉并重新打开窗口。
3. 在 GitHub 下载本仓库的 ZIP 并解压，或先克隆再打开文件夹。
4. 双击 **`启动工作台.bat`**。第一次会自动安装 `yt-dlp`，然后打开浏览器里的 `http://127.0.0.1:8765/`。

更细的安装说明见 [docs/windows-guide.md](docs/windows-guide.md)。

## 命令行（macOS / Linux，或你更习惯终端时）

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

浏览器打开 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)。本机需要已安装 `ffmpeg` 和 `ffprobe`。

## 还没有做的

自动从任意新链接里找出「最有传播潜力」的片段，还不在这一版。你可以先自己填时间戳，或点「加载示例配方」用现成的示例。后面如果加自动分析，也会继续只在本地运行。

## 许可

MIT License。Copyright (c) 2026 0xMulight。
