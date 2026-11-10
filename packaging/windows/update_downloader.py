"""Update only the bundled pure-Python yt-dlp, without pip or admin rights.

Uses PyPI's public JSON API and verifies its published SHA256. Close the app
first; neither system Python nor the machine's global PATH is modified.
"""
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
import hashlib
import io
import json
import re
import shutil
import socket
import sys
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / "runtime" / "Lib" / "site-packages"


def fetch(url, limit):
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError("下载内容异常大，已停止更新。")
    return data


def main():
    with socket.socket() as probe:
        probe.settimeout(0.3)
        if probe.connect_ex(("127.0.0.1", 8765)) == 0:
            raise RuntimeError("请先关闭工作台窗口，再更新下载组件。")
    print("正在检查 PyPI 上的 yt-dlp 稳定版…", flush=True)
    meta = json.loads(fetch("https://pypi.org/pypi/yt-dlp/json", 5_000_000))
    # Fail closed for a future unfamiliar constraint instead of installing an
    # incompatible release into an isolated embedded interpreter.
    requirement = meta["info"].get("requires_python", "")
    match = re.fullmatch(r">=\s*(\d+)\.(\d+)(?:\.(\d+))?", requirement)
    if not match:
        raise RuntimeError(f"新版的 Python 要求无法自动确认：{requirement}。请下载新版完整一键包。")
    minimum = tuple(int(x or 0) for x in match.groups())
    if sys.version_info[:3] < minimum:
        raise RuntimeError(f"新版需要 Python {requirement}。请下载新版完整一键包。")
    wheel = next((a for a in meta["urls"]
                  if a["filename"].endswith("-py3-none-any.whl") and not a.get("yanked")), None)
    if not wheel or urlparse(wheel["url"]).hostname != "files.pythonhosted.org":
        raise RuntimeError("没有找到可信的纯 Python wheel，已停止更新。")
    print(f"正在下载 yt-dlp {meta['info']['version']}…", flush=True)
    data = fetch(wheel["url"], 30_000_000)
    if hashlib.sha256(data).hexdigest() != wheel["digests"]["sha256"]:
        raise RuntimeError("SHA256 校验失败，保留旧版，未安装下载内容。")
    TARGET.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".ytdlp-update-", dir=TARGET.parent) as scratch:
        scratch = Path(scratch)
        staged, backup = scratch / "new", scratch / "old"
        staged.mkdir()
        backup.mkdir()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(i.file_size for i in archive.infolist()) > 200_000_000:
                raise RuntimeError("wheel 解压大小异常，已停止更新。")
            for member in archive.infolist():
                parts = PurePosixPath(member.filename).parts
                if not parts or member.is_dir():
                    continue
                if any(p in ("..", "/") or ":" in p or "\\" in p for p in parts):
                    raise RuntimeError("wheel 含不安全的路径，已停止更新。")
                first = parts[0]
                if first != "yt_dlp" and not (first.startswith("yt_dlp-") and first.endswith(".dist-info")):
                    continue
                destination = staged.joinpath(*parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(member))
        if not (staged / "yt_dlp" / "__init__.py").is_file():
            raise RuntimeError("wheel 不完整，保留旧版。")
        old_items = [p for p in TARGET.iterdir() if p.name == "yt_dlp" or
                     (p.name.startswith("yt_dlp-") and p.name.endswith(".dist-info"))]
        moved, installed = [], []
        try:
            for old in old_items:
                old.rename(backup / old.name)
                moved.append(old.name)
            for new in staged.iterdir():
                new.rename(TARGET / new.name)
                installed.append(new.name)
        except Exception:
            for name in installed:
                path = TARGET / name
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink(missing_ok=True)
            for name in moved:
                (backup / name).rename(TARGET / name)
            raise
    print("更新成功。可以重新双击「启动片段工作台.bat」。", flush=True)
    print("更新版本及许可随包保存在 runtime/Lib/site-packages/yt_dlp-*.dist-info/。", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"更新失败：{exc}\n请检查网络后重试，或下载新版完整一键包。", flush=True)
        sys.exit(1)
