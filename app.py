#!/usr/bin/env python3
"""Clip Workbench: a local web app for cutting short clips from X/Twitter videos."""

from __future__ import annotations

import json
import mimetypes
import re
import shutil
import subprocess
import threading
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "work"
SOURCES = WORK / "sources"
OUTPUT = WORK / "output"
EXAMPLES = ROOT / "examples"
STATIC = ROOT / "static"

HOST = "127.0.0.1"
PORT = 8765

ALLOWED_HOSTS = {"x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"}
STATUS_RE = re.compile(r"status(?:es)?/(\d+)")
SAFE_NAME = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff_-]+")

JOB_LOCK = threading.Lock()


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def parse_clock(value: str) -> float:
    text = str(value).strip()
    if not text:
        raise ValueError("时间不能为空")
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return float(text)
    parts = text.split(":")
    if not 2 <= len(parts) <= 3 or not all(p.replace(".", "", 1).isdigit() for p in parts):
        raise ValueError(f"无法识别的时间：{value}")
    nums = [float(p) for p in parts]
    if len(nums) == 2:
        minutes, seconds = nums
        return minutes * 60 + seconds
    hours, minutes, seconds = nums
    return hours * 3600 + minutes * 60 + seconds


def format_clock(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def slug(text: str, fallback: str) -> str:
    cleaned = SAFE_NAME.sub("-", text).strip("-")
    return (cleaned or fallback)[:40]


def tweet_id(url: str) -> str | None:
    match = STATUS_RE.search(url)
    return match.group(1) if match else None


def is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    return host in ALLOWED_HOSTS and bool(tweet_id(url))


def ffprobe_duration(path: Path) -> float:
    proc = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "读取视频时长失败")
    return float(proc.stdout.strip())


def health() -> dict:
    ffmpeg = which("ffmpeg")
    ffprobe = which("ffprobe")
    ytdlp = which("yt-dlp")
    ytdlp_mod = True
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        ytdlp_mod = False
    return {
        "ok": bool(ffmpeg and ffprobe and (ytdlp or ytdlp_mod)),
        "ffmpeg": bool(ffmpeg),
        "ffprobe": bool(ffprobe),
        "yt_dlp": bool(ytdlp or ytdlp_mod),
        "host": f"http://{HOST}:{PORT}/",
    }


def import_url(url: str) -> dict:
    url = url.strip()
    if not is_allowed_url(url):
        raise ValueError("请粘贴完整的 x.com 或 twitter.com 视频帖链接，形如 https://x.com/用户名/status/数字")
    status = tweet_id(url)
    assert status
    dest_dir = SOURCES / status
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "source.mp4"
    if dest.exists() and dest.stat().st_size > 0:
        duration = ffprobe_duration(dest)
        meta = {"id": status, "url": url, "duration": duration, "path": str(dest)}
        (dest_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        return meta

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("还没有安装 yt-dlp。请先运行：python -m pip install -r requirements.txt") from exc

    opts = {
        "outtmpl": str(dest_dir / "source.%(ext)s"),
        "merge_output_format": "mp4",
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv+ba/b",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

    if not dest.exists():
        candidates = sorted(dest_dir.glob("source.*"))
        if not candidates:
            raise RuntimeError("视频拉取完成，但没有找到输出文件。这条帖子可能没有可下载的原视频。")
        # Remux if needed
        candidate = candidates[0]
        if candidate.suffix.lower() != ".mp4":
            proc = run(
                ["ffmpeg", "-y", "-i", str(candidate), "-c", "copy", "-movflags", "+faststart", str(dest)],
                timeout=300,
            )
            if proc.returncode != 0 or not dest.exists():
                raise RuntimeError(proc.stderr.strip() or "无法把视频转成 MP4")
        else:
            candidate.replace(dest)

    duration = ffprobe_duration(dest)
    meta = {"id": status, "url": url, "duration": duration, "path": str(dest)}
    (dest_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def import_local(src: Path) -> dict:
    if not src.is_file():
        raise ValueError("找不到这个本地视频文件")
    source_id = "local-" + uuid.uuid4().hex[:10]
    dest_dir = SOURCES / source_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "source.mp4"
    if src.suffix.lower() == ".mp4":
        shutil.copy2(src, dest)
    else:
        proc = run(
            ["ffmpeg", "-y", "-i", str(src), "-c", "copy", "-movflags", "+faststart", str(dest)],
            timeout=300,
        )
        if proc.returncode != 0:
            proc = run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(src),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    str(dest),
                ],
                timeout=600,
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr.strip() or "无法读取这个本地视频")
    duration = ffprobe_duration(dest)
    meta = {"id": source_id, "url": "", "duration": duration, "path": str(dest)}
    (dest_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def list_examples() -> list[dict]:
    items = []
    for path in sorted(EXAMPLES.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        items.append(
            {
                "id": path.stem,
                "title": data.get("title") or path.stem,
                "author": data.get("author", ""),
                "source_url": data.get("source_url", ""),
                "clip_count": len(data.get("clips") or []),
            }
        )
    return items


def load_example(name: str) -> dict:
    path = (EXAMPLES / name).with_suffix(".json")
    if not path.exists() or path.resolve().parent != EXAMPLES.resolve():
        raise ValueError("没有这个示例配方")
    return json.loads(path.read_text(encoding="utf-8"))


def cut_clips(source_id: str, clips: list[dict]) -> dict:
    source_id = slug(source_id, "")
    if not source_id:
        raise ValueError("缺少视频编号")
    src_dir = SOURCES / source_id
    src = src_dir / "source.mp4"
    if not src.exists():
        raise ValueError("还没有拉取这条视频，请先粘贴链接并拉取")
    duration = ffprobe_duration(src)
    if not clips:
        raise ValueError("请至少添加一个片段")

    out_dir = OUTPUT / source_id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for index, item in enumerate(clips, start=1):
        start = parse_clock(item.get("start", ""))
        end = parse_clock(item.get("end", ""))
        title = str(item.get("title") or f"片段{index}").strip()
        if end <= start:
            raise ValueError(f"片段「{title}」的结束时间必须大于开始时间")
        if start < 0 or end > duration + 0.25:
            raise ValueError(f"片段「{title}」超出了原片范围（{format_clock(duration)}）")
        length = end - start
        warnings = []
        if length < 5:
            warnings.append("短于 5 秒，可能不符合 X 官方剪辑的最短时长")
        if length > 60:
            warnings.append("超过 60 秒，可能不符合 X 官方剪辑的最长时长")
        if duration > 0 and length > duration * 0.3 + 0.05:
            warnings.append("超过原片的 30%，可能不符合 X 官方剪辑规则")

        filename = f"clip-{index:02d}-{slug(title, f'clip{index}')}.mp4"
        dest = out_dir / filename
        proc = run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{start:.3f}",
                "-to",
                f"{end:.3f}",
                "-i",
                str(src),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                str(dest),
            ],
            timeout=180,
        )
        if proc.returncode != 0 or not dest.exists():
            raise RuntimeError(proc.stderr.strip() or f"剪辑「{title}」失败")
        results.append(
            {
                "index": index,
                "title": title,
                "start": format_clock(start),
                "end": format_clock(end),
                "seconds": round(length, 2),
                "point": item.get("point") or "",
                "recommend": bool(item.get("recommend")),
                "warnings": warnings,
                "file": f"/media/output/{source_id}/{filename}",
                "download_name": filename,
            }
        )
    return {"id": source_id, "duration": duration, "clips": results}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 2_000_000:
            raise ValueError("请求太大")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("请求格式不对")
        return data

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path in {"/", "/index.html"}:
            self.path = "/index.html"
            return super().do_GET()
        if path == "/api/health":
            return self._json(200, health())
        if path == "/api/examples":
            return self._json(200, {"examples": list_examples()})
        if path.startswith("/api/examples/"):
            name = path.rsplit("/", 1)[-1]
            try:
                return self._json(200, load_example(name))
            except ValueError as exc:
                return self._json(404, {"error": str(exc)})
        if path.startswith("/media/output/"):
            return self._send_work_file(OUTPUT, path[len("/media/output/") :])
        if path.startswith("/media/sources/"):
            return self._send_work_file(SOURCES, path[len("/media/sources/") :])
        return super().do_GET()

    def _send_work_file(self, base: Path, rel: str) -> None:
        target = (base / rel).resolve()
        if not str(target).startswith(str(base.resolve())) or not target.is_file():
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f'inline; filename="{target.name}"')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            body = self._read_json()
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        if not JOB_LOCK.acquire(blocking=False):
            return self._json(409, {"error": "已有任务在进行，请稍后再试"})
        try:
            if parsed.path == "/api/import":
                url = str(body.get("url") or "").strip()
                local = str(body.get("local_path") or "").strip()
                if url:
                    result = import_url(url)
                    result["preview"] = f"/media/sources/{result['id']}/source.mp4"
                    return self._json(200, result)
                if local:
                    result = import_local(Path(local).expanduser())
                    result["preview"] = f"/media/sources/{result['id']}/source.mp4"
                    return self._json(200, result)
                return self._json(400, {"error": "请提供视频链接"})
            if parsed.path == "/api/cut":
                source_id = str(body.get("id") or "")
                clips = body.get("clips") or []
                if not isinstance(clips, list):
                    return self._json(400, {"error": "片段列表格式不对"})
                result = cut_clips(source_id, clips)
                return self._json(200, result)
            return self._json(404, {"error": "没有这个接口"})
        except ValueError as exc:
            return self._json(400, {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001
            return self._json(500, {"error": str(exc)})
        finally:
            JOB_LOCK.release()


def main() -> None:
    SOURCES.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    mimetypes.add_type("text/html; charset=utf-8", ".html")
    mimetypes.add_type("application/json", ".json")
    mimetypes.add_type("video/mp4", ".mp4")
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"片段工作台已启动：{url}")
    print("这是本地服务，只在这台电脑上访问。按 Ctrl+C 结束。")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已关闭")
        httpd.server_close()


if __name__ == "__main__":
    main()
