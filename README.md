# 沐光切片 / Mulight Clips

按亮点配方把视频切成短片段，并自动拼成一条。打开网页就能用，无需安装 Python 或 FFmpeg。

**网页版：** [https://0xMulight.github.io/clip-workbench/](https://0xMulight.github.io/clip-workbench/)

公开网页的源码在 `docs/` 目录，由 GitHub Pages 从 `main` 分支的这个目录发布。

这不是 X 的官方产品，也不能替代 App 里的「剪辑视频」。切出来或拼好的都是普通 MP4，发到 X 上不会自动带「Clip from」署名和回流。如果你要官方剪辑，用这里对好时间，再回到手机 App 里剪。

## 网页版怎么用

1. 打开上面的页面，上传一段本地视频（常见的 MP4、WebM 等即可）。公开网页**不能**直接下载 X / Twitter 视频：请先自行保存原片再上传。
2. 导入亮点配方：粘贴 JSON，或每行一段时间戳（例如 `08:50-09:49 镜像猎杀`，或 `2:28 3:28 成绩单`）。也可以点「加载示例配方」。示例不含视频。
3. 点「开始剪辑并拼接」。首次使用会在浏览器里下载约 32 MB 的剪辑引擎，页面会显示进度。
4. 结果里可以预览、下载整条亮点拼接片，也可以单独下载每一段。若只想切段、先不拼接，用「只切各段」。

片段短于 5 秒、长于 60 秒，或超过原片的 30% 时，页面会提醒——这是 X 官方「剪辑视频」的规则，不是本工具自己的评分。即便有提醒，仍会按你给的时间切出文件。

视频只在你的浏览器里处理，不会上传到服务器。若在页面里粘贴了 x.com / twitter.com 链接，页面会明确告诉你无法代为下载，并建议改用本机版。请只处理你有权使用、或准备引用原作者的视频。

## 本机版：粘贴 X 链接，自动下载并拼接

如果你想粘贴 `x.com` / `twitter.com` 帖子链接，在自己的电脑上自动拉取原片，再按配方切片并拼成一条，请用仓库里的 Python 工具。拉取、剪辑和拼接都在本机完成，不会把视频上传到第三方。

典型用法：

1. 粘贴带视频的帖子链接。
2. 导入亮点配方（JSON 或简单文本，同上）。
3. 点「拉取并拼接」。工具会下载原片、按时间戳切出各段，再合成一条亮点片。单段仍可单独下载。

### Windows 一键包（推荐，Windows 10/11 x64）

**[下载 Windows 一键包 ZIP](https://github.com/0xMulight/clip-workbench/releases/download/v0.3.1/clip-workbench-windows-x64.zip)** · [Release 说明与 SHA256](https://github.com/0xMulight/clip-workbench/releases/tag/v0.3.1)

1. 下载后右键 ZIP →「全部解压」，不要在压缩包预览里运行。
2. 打开解压后的文件夹，双击 **`启动沐光切片.bat`**。
3. 浏览器自动打开 `http://127.0.0.1:8765/`，粘贴视频帖链接、导入配方，点「拉取并拼接」。


无需安装 Python / FFmpeg，不改系统 PATH，不需要管理员权限。保持启动窗口开启，关闭它即停止。
组件随包附带；若旧下载器失效，先关闭沐光切片，再双击 **`更新下载组件.bat`**。
包未代码签名；如弹 SmartScreen，请先核对 Release 来源和 SHA256，再决定是否「更多信息 → 仍要运行」。
已做 Linux 上的包结构/同版 Python 验证；Windows 可执行文件和首次启动仍需真实 Windows 验证。

### 手动安装（备选）

1. 安装 [Python 3.11+](https://www.python.org/downloads/)，安装时勾选 **Add python.exe to PATH**。
2. 安装 [FFmpeg](https://www.gyan.dev/ffmpeg/builds/)，把里面带 `ffmpeg.exe` 和 `ffprobe.exe` 的 `bin` 目录加到系统 PATH。装完后关掉并重新打开窗口。
3. 在 GitHub 下载本仓库的 ZIP 并解压，或先克隆再打开文件夹。
4. 双击 **`启动沐光切片.bat`**。第一次会自动安装 `yt-dlp`，然后打开浏览器里的 `http://127.0.0.1:8765/`。

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

自动从任意视频里找出「最有传播潜力」的片段，还不在这一版。亮点来自你导入或填写的时间戳配方。后面如果加自动分析，也会继续只在本地 / 浏览器里运行。

## 许可

MIT License。Copyright (c) 2026 0xMulight。

网页版的剪辑引擎使用 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)（MIT），并选用官方单线程核心，以便在无法设置 COOP/COEP 的 GitHub Pages 上运行。

## 构建 Windows 一键包（维护者）

打包模板在 `packaging/windows/`，构建脚本固定组件版本和 SHA256；不需要 GitHub Actions 或在系统中安装 Windows Python。
在已提交模板的 checkout 中运行：

```bash
python3 scripts/build-windows-pack.py --ref HEAD --output-dir dist
python3 scripts/test-windows-pack.py dist/clip-workbench-windows-x64.zip
```

仅 allowlist 中的已跟踪源文件、模板和上游组件进入 ZIP。二进制只作为 Release 附件，不提交进 Git。
包内含 Python 3.13.17（PSF）、yt-dlp 2026.10.26（纯 Python wheel，Unlicense）及 Gyan FFmpeg/ffprobe 9.0.2 essentials（GPLv3），
各自许可、上游 README、源码与构建链接、组件及逐文件校验清单在包内 `LICENSES/`、`SOURCES.txt`、`COMPONENTS.json`。
源码/模板以 `SOURCE-COMMIT.txt` 中的提交为准，可能先于维护者合并 PR 发布。
