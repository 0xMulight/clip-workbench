#!/usr/bin/env python3
"""Static artifact checks; these do not claim to execute Windows EXEs."""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zipfile


def main():
    path = Path(sys.argv[1])
    prefix = "clip-workbench-windows-x64/"
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert all(n.startswith(prefix) for n in names)
        forbidden = ("/__pycache__/", "/.git/", "/work/", "/cookies.txt", "/.env", "/.github/workflows/")
        assert not any(any(x in n for x in forbidden) or n.endswith((".pyc", ".mp4", ".webm")) for n in names)
        def read(name):
            return archive.read(prefix + name)
        manifest = json.loads(read("COMPONENTS.json"))
        for name, expected in manifest["files_sha256"].items():
            assert hashlib.sha256(read(name)).hexdigest() == expected, name
        for name in ("启动沐光切片.bat", "更新下载组件.bat"):
            data = read(name)
            assert not data.startswith(b"\xef\xbb\xbf")
            assert b"\r\n" in data and b"\n" not in data.replace(b"\r\n", b"")
            text = data.decode("utf-8")
            assert 'pushd "%~dp0"' in text
            assert '"%CD%\\runtime\\python.exe"' in text
            assert "setlocal" in text and "chcp 65001" in text
            assert "setx" not in text.lower()
        assert read("使用说明.txt").startswith(b"\xef\xbb\xbf")
        pth = read("runtime/python313._pth").decode().splitlines()
        assert pth == ["python313.zip", ".", "..", "Lib\\site-packages", "import site"]
        for name in ("runtime/python.exe", "bin/ffmpeg.exe", "bin/ffprobe.exe"):
            exe = read(name)
            assert exe[:2] == b"MZ"
            offset = struct.unpack_from("<I", exe, 0x3C)[0]
            assert exe[offset:offset + 4] == b"PE\0\0"
            assert struct.unpack_from("<H", exe, offset + 4)[0] == 0x8664, name  # AMD64
        for name in ("LICENSES/Python-LICENSE.txt", "LICENSES/FFmpeg-GPLv3.txt", "LICENSES/yt-dlp-LICENSE.txt",
                     "LICENSES/FFmpeg-UPSTREAM-README.txt", "LICENSES/Clip-Workbench-MIT.txt", "SOURCES.txt"):
            assert len(read(name)) > 500, name
        assert b"9.0.2" in read("LICENSES/FFmpeg-UPSTREAM-README.txt")
        assert b"2026.10.26" in read("runtime/Lib/site-packages/yt_dlp/version.py")
        print("PASS: ZIP integrity, allowlist, file checksums, CRLF BAT quoting, BOM instructions, ._pth, AMD64 PE files, licenses")
        print(f"Files: {len(names)}; ZIP: {path.stat().st_size} bytes; source: {manifest['application_commit']}")
    print("SHA256:", hashlib.file_digest(path.open("rb"), "sha256").hexdigest())


if __name__ == "__main__":
    main()
