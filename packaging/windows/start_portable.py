"""Portable launcher. Only changes PATH for this process and its children."""
from pathlib import Path
import os
import socket
import sys
import tempfile
import traceback

ROOT = Path(__file__).resolve().parent


def main():
    # Explorer's ZIP preview normally runs a lone extracted BAT from TEMP. Do not
    # create work/output there, even if an archiver happens to extract siblings.
    temp = Path(tempfile.gettempdir()).resolve()
    if ROOT.is_relative_to(temp):
        raise RuntimeError("当前在临时目录运行。请右键 ZIP → 全部解压到桌面或文档，再打开解压后的文件夹启动。")
    for name in ("app.py", "static/index.html", "docs/clip.js", "bin/ffmpeg.exe", "bin/ffprobe.exe",
                 "runtime/Lib/site-packages/yt_dlp/__init__.py"):
        if not (ROOT / name).is_file():
            raise RuntimeError(f"缺少 {name}。不要在 ZIP 预览里双击；请先完整解压。若被安全软件隔离，请核对官方 Release 和 SHA256 后重新解压。")
    os.chdir(ROOT)
    os.environ["PATH"] = str(ROOT / "bin") + os.pathsep + os.environ.get("PATH", "")
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    with socket.socket() as probe:
        probe.settimeout(0.3)
        if probe.connect_ex(("127.0.0.1", 8765)) == 0:
            raise RuntimeError("8765 端口已被使用。如果工作台已经开着，请直接访问 http://127.0.0.1:8765/；否则先关闭占用端口的程序。")
    import yt_dlp  # noqa: F401 -- verify bundled import before starting
    import app
    print("工作台只在本机运行；浏览器会自动打开。请保持此窗口开启，关闭窗口即可停止。", flush=True)
    app.main()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"\n启动失败：{exc}", flush=True)
        try:
            (ROOT / "startup-error.log").write_text(traceback.format_exc(), encoding="utf-8")
            print("详细错误已保存到 startup-error.log。", flush=True)
        except OSError:
            pass
        sys.exit(1)
