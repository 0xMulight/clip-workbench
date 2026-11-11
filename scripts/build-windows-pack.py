#!/usr/bin/env python3
"""Build a Windows x64 ZIP on Linux or Windows, without running Windows code.

Only allowlisted tracked application files go into the package; media, cookies,
.git, __pycache__, development environments, and work/ can never be included.
Download pins below were checked against the upstream HTTPS sources.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile

REPO = Path(__file__).resolve().parents[1]
PYTHON_VERSION = "3.13.17"
PYTHON_SHA256 = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"
FFMPEG_VERSION = "9.0.2"
FFMPEG_SHA256 = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
YTDLP_VERSION = "2026.10.26"
YTDLP_SHA256 = "a05c5b5d8562f7e8a62f5334348b406af4930d56d3a65f8021d14af0e22339ae"
YTDLP_URL = "https://files.pythonhosted.org/packages/7f/3d/16ea7d5638cf585991f2c5705e8083688dde633d32d0871f2404e0f4d827/yt_dlp-2026.10.26-py3-none-any.whl"
PINNED = {
    "python": {"version": PYTHON_VERSION, "license": "PSF license and bundled notices",
               "filename": f"python-{PYTHON_VERSION}-embed-amd64.zip",
               "url": f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip",
               "sha256": PYTHON_SHA256,
               "source": f"https://www.python.org/ftp/python/{PYTHON_VERSION}/Python-{PYTHON_VERSION}.tar.xz"},
    "ffmpeg": {"version": FFMPEG_VERSION, "license": "GPLv3",
               "filename": "ffmpeg-release-essentials.zip",
               "url": "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
               "sha256": FFMPEG_SHA256,
               "source": "https://github.com/FFmpeg/FFmpeg/commit/946fcce07b",
               "checksum_source": "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256",
               "build_information": "https://www.gyan.dev/ffmpeg/builds/"},
    "yt-dlp": {"version": YTDLP_VERSION, "license": "Unlicense (pure Python wheel)",
               "filename": f"yt_dlp-{YTDLP_VERSION}-py3-none-any.whl",
               "url": YTDLP_URL, "sha256": YTDLP_SHA256,
               "source": f"https://github.com/yt-dlp/yt-dlp/tree/{YTDLP_VERSION}"},
}


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(component, cache):
    path = cache / component["filename"]
    if path.exists():
        if sha256(path) == component["sha256"]:
            return path
        raise RuntimeError(f"缓存校验失败：{path}。请检查来源后移除该缓存再重试。")
    temporary = path.with_suffix(path.suffix + ".part")
    print(f"下载 {component['url']}", flush=True)
    try:
        request = urllib.request.Request(component["url"], headers={"User-Agent": "Clip-Workbench-Packager/0.3"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as out:
            shutil.copyfileobj(response, out)
        if sha256(temporary) != component["sha256"]:
            raise RuntimeError("上游文件与固定 SHA256 不符，停止构建。可能是可变 URL 更新；不要绕过校验。")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def safe_extract(archive, destination):
    for member in archive.infolist():
        parts = PurePosixPath(member.filename).parts
        if any(p in ("..", "/") or ":" in p or "\\" in p for p in parts):
            raise RuntimeError(f"不安全的 ZIP 路径：{member.filename}")
        if member.is_dir():
            continue
        target = destination.joinpath(*parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(member))


def copy_tracked_source(ref, stage):
    archive = subprocess.check_output(["git", "archive", "--format=tar", ref], cwd=REPO)
    templates = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for member in source.getmembers():
            if not member.isfile():
                continue
            name = member.name
            wanted = name in {"app.py", "LICENSE", "docs/clip.js"} or name.startswith(("static/", "examples/"))
            if name.startswith("packaging/windows/"):
                templates[PurePosixPath(name).name] = source.extractfile(member).read()
            elif wanted:
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source.extractfile(member).read())
    for name in ("start_portable.py", "update_downloader.py", "启动沐光切片.bat", "更新下载组件.bat", "使用说明.txt"):
        if name not in templates:
            raise RuntimeError(f"{ref} 不包含打包模板 {name}；先提交模板，然后从该提交构建。")
        data = templates[name]
        if name.endswith(".bat"):
            data = data.decode("utf-8-sig").replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")
        elif name == "使用说明.txt":
            data = ("\ufeff" + data.decode("utf-8-sig").replace("\r\n", "\n").replace("\n", "\r\n")).encode("utf-8")
        (stage / name).write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path.home() / ".cache" / "clip-workbench-pack")
    parser.add_argument("--output-dir", type=Path, default=REPO / "dist")
    parser.add_argument("--ref", default="HEAD", help="tracked source commit, including packaging templates")
    parser.add_argument("--version", default="0.3.0")
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    commit = subprocess.check_output(["git", "rev-parse", args.ref], cwd=REPO, text=True).strip()
    downloads = {name: download(info, args.cache_dir) for name, info in PINNED.items()}
    with tempfile.TemporaryDirectory(prefix="clip-pack-") as tmp:
        stage = Path(tmp) / "clip-workbench-windows-x64"
        stage.mkdir()
        copy_tracked_source(commit, stage)
        runtime, bin_dir, notices = stage / "runtime", stage / "bin", stage / "LICENSES"
        runtime.mkdir()
        bin_dir.mkdir()
        notices.mkdir()
        with zipfile.ZipFile(downloads["python"]) as archive:
            safe_extract(archive, runtime)
        shutil.copy2(runtime / "LICENSE.txt", notices / "Python-LICENSE.txt")
        (runtime / "python313._pth").write_bytes(b"python313.zip\r\n.\r\n..\r\nLib\\site-packages\r\nimport site\r\n")
        site = runtime / "Lib" / "site-packages"
        site.mkdir(parents=True)
        with zipfile.ZipFile(downloads["yt-dlp"]) as archive:
            # Pure wheel has only yt_dlp/ and its metadata; no executable bundle.
            safe_extract(archive, site)
        shutil.copy2(site / f"yt_dlp-{YTDLP_VERSION}.dist-info" / "licenses" / "LICENSE",
                     notices / "yt-dlp-LICENSE.txt")
        with zipfile.ZipFile(downloads["ffmpeg"]) as archive:
            prefix = f"ffmpeg-{FFMPEG_VERSION}-essentials_build/"
            for executable in ("ffmpeg.exe", "ffprobe.exe"):
                (bin_dir / executable).write_bytes(archive.read(prefix + "bin/" + executable))
            (notices / "FFmpeg-GPLv3.txt").write_bytes(archive.read(prefix + "LICENSE"))
            (notices / "FFmpeg-UPSTREAM-README.txt").write_bytes(archive.read(prefix + "README.txt"))
        shutil.copy2(stage / "LICENSE", notices / "Clip-Workbench-MIT.txt")
        manifest = {"package_version": args.version, "application_commit": commit,
                    "architecture": "Windows x64", "components": PINNED,
                    "files_sha256": {}}
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                manifest["files_sha256"][path.relative_to(stage).as_posix()] = sha256(path)
        (stage / "COMPONENTS.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (stage / "SOURCE-COMMIT.txt").write_text(f"https://github.com/0xMulight/clip-workbench/commit/{commit}\n", encoding="utf-8")
        source_notes = f"""Sources, licenses and build information / 组件来源和许可

Application: https://github.com/0xMulight/clip-workbench/tree/{commit}
Package version: {args.version}; application commit: {commit}
Application MIT source is included (app.py, static, docs/clip.js, examples).
No upstream binary has been modified. Python, FFmpeg and yt-dlp remain separate components.

Python {PYTHON_VERSION} Windows amd64 embeddable, PSF license:
{PINNED['python']['url']}
Source: {PINNED['python']['source']}
See LICENSES/Python-LICENSE.txt (includes Python's bundled third-party notices).

FFmpeg / ffprobe {FFMPEG_VERSION}, Gyan essentials static Windows x64, GPLv3:
{PINNED['ffmpeg']['url']}
SHA256: {FFMPEG_SHA256}
Upstream binary, build settings, external libraries/versions: LICENSES/FFmpeg-UPSTREAM-README.txt
GPLv3: LICENSES/FFmpeg-GPLv3.txt
Exact FFmpeg source revision published by the builder:
{PINNED['ffmpeg']['source']}
Source archive: https://github.com/FFmpeg/FFmpeg/archive/946fcce07b.tar.gz
Builder and build/source information: https://www.gyan.dev/ffmpeg/builds/
Upstream builder repository: https://github.com/GyanD/codexffmpeg
FFmpeg source/license guidance: https://ffmpeg.org/legal.html
The bundled GPL text and full upstream README are retained, not just this summary.

yt-dlp {YTDLP_VERSION}, pure Python wheel, Unlicense:
{YTDLP_URL}
Source: {PINNED['yt-dlp']['source']}
LICENSES/yt-dlp-LICENSE.txt; wheel metadata and license also retained in runtime/Lib/site-packages/.
No PyInstaller yt-dlp.exe, no optional native Python dependencies are bundled.
The updater may change yt-dlp's installed version; consult its dist-info after updating.

Full download pins and per-file SHA256 checksums: COMPONENTS.json.
"""
        (stage / "SOURCES.txt").write_text(source_notes, encoding="utf-8")
        archive_path = args.output_dir / "clip-workbench-windows-x64.zip"
        # Stable timestamps and ordering make rebuilds of this exact ref deterministic.
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(stage.rglob("*")):
                if not path.is_file():
                    continue
                name = stage.name + "/" + path.relative_to(stage).as_posix()
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compresslevel=6)
        checksum = sha256(archive_path)
        checksum_path = archive_path.with_suffix(".zip.sha256")
        checksum_path.write_text(f"{checksum}  {archive_path.name}\n", encoding="ascii")
        print(f"{archive_path}\n{archive_path.stat().st_size} bytes\nSHA256 {checksum}")
        print(f"Source commit: {commit}\nChecksum: {checksum_path}")


if __name__ == "__main__":
    main()
