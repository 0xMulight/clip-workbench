# 沐光切片 · Windows 使用说明


## Windows 一键包（推荐）

[下载完整一键包 ZIP](https://github.com/0xMulight/clip-workbench/releases/download/v0.3.1/clip-workbench-windows-x64.zip) · [Release 与 SHA256](https://github.com/0xMulight/clip-workbench/releases/tag/v0.3.1)

1. 下载后右键 ZIP →「全部解压」，建议放在桌面或文档目录，不要直接在 ZIP 预览里双击。
2. 进入解压后的文件夹，双击 **`启动沐光切片.bat`**。
3. 浏览器会自动打开 `http://127.0.0.1:8765/`。粘贴视频帖链接、导入配方，再点「拉取并拼接」。
4. 预览并下载拼接片；各段仍可单独下载。关闭黑色启动窗口即停止服务。


不需要安装 Python / FFmpeg、不改 PATH、不需要管理员权限。支持 Windows 10/11 x64（不是 32 位或 ARM 原生包）。
旧版 yt-dlp 失效时，先关闭沐光切片，再双击 **`更新下载组件.bat`**；更新只影响包内下载器，不碰系统 Python。
请完整保留 runtime、bin、static、docs 等子目录；不要只复制 BAT。

- SmartScreen 若弹窗：包未代码签名，先核对 Release 来源和 SHA256；确认可信后可「更多信息 → 仍要运行」，不要关闭系统安全保护。
- 防火墙：仅监听本机，通常无需放行；如弹窗，最多只允许专用网络，不允许公用网络。
- 被提示临时目录/文件不全：重新「全部解压」到桌面或文档。若被安全软件隔离，请先核对来源。
- 端口 8765 已占用：已有沐光切片在运行时直接开上述网址，否则先关闭占用程序。
- 启动报错：查看同目录 `startup-error.log`。请勿公开粘贴隐私数据。

已在 Linux 检查 ZIP 结构与同版 Python 导入/服务；Windows EXE 和桌面首启仍需真实 Windows 确认。
此包是普通本机剪辑工具，非官方，不替代 X Clip video，合成片也没有自动「Clip from」。

## 手动安装（备选）

如果不用一键包，可按下面步骤安装。

### Python

1. 打开 [Python 官方下载页](https://www.python.org/downloads/)，安装 3.11 或更高版本。
2. 安装界面第一屏勾选 **Add python.exe to PATH**，再点 Install Now。
3. 装完后新开一个命令提示符，输入 `python --version`，应能看到版本号。

### FFmpeg

1. 打开 [gyan.dev 的 FFmpeg 构建页](https://www.gyan.dev/ffmpeg/builds/)，下载 **ffmpeg-release-essentials.zip**。
2. 解压到一个固定目录，例如 `C:\ffmpeg`。
3. 确认 `C:\ffmpeg\bin` 里有 `ffmpeg.exe` 和 `ffprobe.exe`（若解压后多一层文件夹，以实际路径为准）。
4. 把这个 `bin` 目录加到系统环境变量 Path：
   - 开始菜单搜索「环境变量」，打开「编辑系统环境变量」→「环境变量」。
   - 在「用户变量」或「系统变量」里选中 Path，编辑，新建，粘贴 `bin` 的完整路径。
5. 关掉所有命令窗口和已打开的「启动沐光切片.bat」，再重新打开，输入 `ffmpeg -version` 确认可用。

## 启动

解压或克隆本仓库后，双击 `启动沐光切片.bat`。第一次会创建 `.venv` 并安装 `yt-dlp`，随后自动打开浏览器。

如果浏览器没有自动打开，手动访问 http://127.0.0.1:8765/ 。

## 常见问题

- **提示没有 Python**：没勾选 PATH，或需要重新打开脚本窗口。
- **提示没有 FFmpeg**：PATH 还没生效，或加错了目录（应指向包含 `ffmpeg.exe` 的 `bin`）。
- **拉取视频失败**：帖子可能不是可下载的预录视频（例如直播、仅图片，或地区限制）。也可以换一条公开的长视频再试。
- **服务打不开**：确认没有别的程序占用 8765 端口，并始终用本机地址访问。这个服务只监听 `127.0.0.1`，不会对局域网开放。

## 拉取并拼接

启动后，在页面里粘贴带视频的 X / Twitter 帖子链接，再导入亮点配方，点「拉取并拼接」。工具会在本机下载原片、按时间戳切段，并合成一条亮点片。公开网页（GitHub Pages）做不到自动下载推特视频，那一步只能在本机版完成。
