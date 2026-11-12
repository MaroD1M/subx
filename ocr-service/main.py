"""SubX OCR sidecar.

Converts PGS and bitmap subtitle tracks (VobSub/DVD) to text. PGS uses pgsrip;
bitmap fallback burns subtitles onto a black background, extracts frames, skips
duplicate frames by image hash and runs OCR in parallel. Jobs are asynchronous
and support progress plus cancellation.
"""

import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
import pysrt
import pytesseract

try:
    from rapidocr import RapidOCR
except Exception:
    RapidOCR = None
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from ocr_utils import clamp_int, is_pgs_codec, merge_chunk_segments, pgsrip_language, pgsrip_sup_name, pgsrip_track_flag, plan_chunks

MEDIA_ROOT = Path(os.getenv("OCR_MEDIA_ROOT", "/media")).resolve()
OCR_TEMP_DIR = Path(os.getenv("OCR_TEMP_DIR", "/app/temp/ocr")).resolve()
OCR_TEMP_DIR.mkdir(parents=True, exist_ok=True)
PGSRIP_BIN = shutil.which("pgsrip")
DEFAULT_LANGUAGE = os.getenv("OCR_LANGUAGE", "en")
MAX_SECONDS = int(os.getenv("OCR_MAX_SECONDS", "14400"))
CHUNK_SECONDS = int(os.getenv("OCR_CHUNK_SECONDS", "1800"))
PGSRIP_TIMEOUT_SECONDS = int(os.getenv("OCR_PGSRIP_TIMEOUT_SECONDS", "7200"))
FFMPEG_TIMEOUT_SECONDS = int(os.getenv("OCR_FFMPEG_TIMEOUT_SECONDS", "3600"))
PROBE_TIMEOUT_SECONDS = int(os.getenv("OCR_PROBE_TIMEOUT_SECONDS", "300"))
CHUNK_RETRIES = int(os.getenv("OCR_CHUNK_RETRIES", "1"))
RESUME_TTL_HOURS = int(os.getenv("OCR_RESUME_TTL_HOURS", "24"))
MIN_CONFIDENCE = float(os.getenv("OCR_MIN_CONFIDENCE", "25"))
OCR_FPS = max(0.5, float(os.getenv("OCR_FPS", "2")))
OCR_WORKERS = max(1, int(os.getenv("OCR_WORKERS", "4")))
OCR_ENGINE = os.getenv("OCR_ENGINE", "auto")
MAX_JOBS = max(1, int(os.getenv("OCR_MAX_JOBS", "50")))
MAX_CONCURRENT_JOBS = max(1, int(os.getenv("OCR_MAX_CONCURRENT_JOBS", "2")))
JOB_RETENTION_SECONDS = max(60, int(os.getenv("OCR_JOB_RETENTION_SECONDS", "3600")))
JOB_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT_JOBS)
RESUME_PREFIX = "subx-ocr-job-"
ALGORITHM_VERSION = 2
_job_locks: dict[str, threading.Lock] = {}
_job_locks_guard = threading.Lock()
_rapidocr_engine = None
TESS_LANG = {
    "en": "eng", "eng": "eng", "zh": "chi_sim+eng", "zh-cn": "chi_sim+eng",
    "zh-tw": "chi_tra+eng", "ja": "jpn+eng", "ko": "kor+eng", "ru": "rus+eng",
    "fr": "fra+eng", "de": "deu+eng", "es": "spa+eng", "it": "ita+eng",
    "pt": "por+eng", "th": "tha+eng", "ar": "ara+eng", "hi": "hin+eng",
    "tr": "tur+eng", "vi": "vie+eng", "uk": "ukr+eng", "nl": "nld+eng",
    "pl": "pol+eng", "sv": "swe+eng", "da": "dan+eng", "fi": "fin+eng",
    "no": "nor+eng", "cs": "ces+eng", "el": "ell+eng", "he": "heb+eng",
    "id": "ind+eng", "ms": "msa+eng"
}

app = FastAPI(title="SubX OCR Sidecar", version="0.1.0")
OCR_API_KEY = os.getenv("OCR_API_KEY", "")


def require_api_key(authorization: str | None = Header(None), x_api_key: str | None = Header(None)) -> None:
    if not OCR_API_KEY:
        return
    provided = authorization.replace("Bearer ", "", 1) if authorization and authorization.startswith("Bearer ") else (x_api_key or "")
    if provided != OCR_API_KEY:
        raise HTTPException(status_code=401, detail="OCR API key 无效")


class OcrRequest(BaseModel):
    path: str
    track_index: int = 0
    language: str = DEFAULT_LANGUAGE
    engine: str | None = None
    min_confidence: float | None = None
    max_seconds: int | None = None
    chunk_seconds: int | None = None
    pgsrip_timeout_seconds: int | None = None
    ffmpeg_timeout_seconds: int | None = None
    chunk_retries: int | None = None
    resume_ttl_hours: int | None = None


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} 未安装")
    return path


def prune_resume_dirs(ttl_hours: int) -> None:
    cutoff = time.time() - max(1, ttl_hours) * 3600
    for entry in OCR_TEMP_DIR.iterdir():
        if not entry.is_dir() or not entry.name.startswith(RESUME_PREFIX):
            continue
        with _job_locks_guard:
            lock = _job_locks.get(str(entry))
        if lock and lock.locked():
            continue
        try:
            if entry.stat().st_mtime < cutoff:
                shutil.rmtree(entry, ignore_errors=True)
        except OSError:
            continue


def job_lock(workdir: Path) -> threading.Lock:
    key = str(workdir)
    with _job_locks_guard:
        return _job_locks.setdefault(key, threading.Lock())


def job_workdir(
    path: Path,
    track_index: int,
    language: str,
    engine: str | None,
    chunk_seconds: int,
    min_confidence: float | None,
) -> Path:
    info = path.stat()
    fingerprint = hashlib.sha256(
        f"{path.resolve()}|{info.st_size}|{info.st_mtime_ns}|{track_index}|{language}|{normalize_engine(engine)}|{chunk_seconds}|{min_confidence}|{OCR_FPS}|v{ALGORITHM_VERSION}".encode("utf-8")
    ).hexdigest()[:32]
    workdir = OCR_TEMP_DIR / f"{RESUME_PREFIX}{fingerprint}"
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir


def load_manifest(workdir: Path) -> dict[str, Any]:
    try:
        data = json.loads((workdir / "manifest.json").read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("version") == ALGORITHM_VERSION and isinstance(data.get("chunks"), dict):
            return data
    except Exception:
        pass
    return {"version": ALGORITHM_VERSION, "chunks": {}}


def save_manifest(workdir: Path, manifest: dict[str, Any]) -> None:
    manifest["updatedAt"] = time.time()
    target = workdir / "manifest.json"
    temporary = workdir / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    temporary.replace(target)


def run_process(
    command: list[str],
    timeout_seconds: int,
    label: str,
    heartbeat: Callable[[str], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    cwd: Path | None = None,
) -> tuple[str, str]:
    process = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )

    def terminate() -> None:
        if process.poll() is not None:
            return
        try:
            if os.name == "posix":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except OSError:
            process.kill()
    started = time.monotonic()
    last_heartbeat = 0.0
    try:
        while True:
            if cancelled and cancelled():
                terminate()
                process.communicate(timeout=5)
                raise RuntimeError("OCR 任务已取消")
            elapsed = time.monotonic() - started
            if elapsed > timeout_seconds:
                terminate()
                stdout, stderr = process.communicate(timeout=5)
                detail = (stderr or stdout or "").strip()[-2000:]
                raise RuntimeError(f"{label}超时（{timeout_seconds}s）{('：' + detail) if detail else ''}")
            try:
                stdout, stderr = process.communicate(timeout=5)
                break
            except subprocess.TimeoutExpired:
                if heartbeat and time.monotonic() - last_heartbeat >= 30:
                    last_heartbeat = time.monotonic()
                    heartbeat(f"{label}处理中（已用 {int(elapsed // 60)} 分钟）")
        if process.returncode != 0:
            detail = (stderr or stdout or "").strip()[-2000:]
            raise RuntimeError(f"{label}失败：{detail or f'exit status {process.returncode}'}")
        return stdout or "", stderr or ""
    finally:
        terminate()


def safe_path(value: str) -> Path:
    path = Path(value).resolve()
    if MEDIA_ROOT not in path.parents and path != MEDIA_ROOT:
        raise HTTPException(status_code=403, detail="媒体路径越权")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="媒体文件不存在")
    return path


def probe(path: Path, track_index: int) -> dict[str, Any]:
    ffprobe = require_tool("ffprobe")
    stdout, _stderr = run_process([
        ffprobe, "-v", "error", "-show_entries",
        "format=duration:stream=index,codec_name,codec_type,width,height:stream_tags=language,title:stream_disposition=default,forced",
        "-of", "json", str(path)
    ], PROBE_TIMEOUT_SECONDS, "媒体探测")
    data = json.loads(stdout)
    streams = [
        stream for stream in data.get("streams", [])
        if stream.get("codec_type") == "subtitle"
    ]
    match = next((stream for stream in streams if int(stream.get("index", -1)) == track_index), None)
    if not match:
        if track_index < len(streams):
            match = streams[track_index]
        else:
            raise HTTPException(status_code=400, detail="字幕轨道不存在")

    # FFmpeg 的 subtitles 滤镜 si 参数使用的是“第几个字幕流”，不是全局 stream index。
    subtitle_index = streams.index(match)
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), {})
    width = int(video.get("width") or 1280)
    height = int(video.get("height") or 720)
    width = max(1280, min(1920, width))
    height = max(720, min(1080, height))
    tags = match.get("tags") or {}
    disposition = match.get("disposition") or {}
    return {
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
        "codec": str(match.get("codec_name", "")),
        "stream_index": int(match.get("index", track_index)),
        "subtitle_index": subtitle_index,
        "language": str(tags.get("language") or "und"),
        "title": str(tags.get("title") or ""),
        "is_forced": bool(disposition.get("forced")),
        "is_default": bool(disposition.get("default")),
        "width": width,
        "height": height,
    }


def normalize_engine(value: str | None = None) -> str:
    engine = str(value or OCR_ENGINE or "auto").strip().lower()
    if engine in {"auto", "rapidocr", "tesseract"}:
        return engine
    return "auto"


def pgs_language(value: str) -> str:
    # pgsrip 接受 en / pt-BR 这类带地区的语言代码；同时把 chi/zho 等三位码规范为 zh。
    return pgsrip_language(value, DEFAULT_LANGUAGE)


def tess_language(value: str) -> str:
    key = (value or DEFAULT_LANGUAGE).lower()
    return TESS_LANG.get(key, value or DEFAULT_LANGUAGE)


def parse_srt(path: Path) -> list[dict[str, Any]]:
    subs = pysrt.open(str(path), encoding="utf-8")
    segments = []
    for index, item in enumerate(subs, start=1):
        text = re.sub(r"\s+", " ", item.text.replace("\n", " ")).strip()
        if not text:
            continue
        segments.append({
            "id": index,
            "start": item.start.ordinal / 1000,
            "end": max(item.start.ordinal / 1000 + 0.3, item.end.ordinal / 1000),
            "text": text,
            "confidence": 0,
            "words": [],
        })
    return segments


def process_error_detail(error: Any) -> str:
    if isinstance(error, subprocess.CalledProcessError):
        stderr = str(error.stderr or "").strip()
        stdout = str(error.stdout or "").strip()
        detail = stderr or stdout or str(error)
        return detail[-2000:]
    return str(error)


def extract_pgs(
    path: Path,
    stream_index: int,
    workdir: Path,
    timeout_seconds: int,
    language: str,
    is_forced: bool,
    cancelled: Callable[[], bool] | None = None,
) -> Path:
    ffmpeg = require_tool("ffmpeg")
    output = workdir / pgsrip_sup_name(language, is_forced)
    run_process([
        ffmpeg, "-y", "-v", "error", "-i", str(path),
        "-map", f"0:{stream_index}", "-c:s", "copy", "-f", "sup", str(output)
    ], timeout_seconds, "PGS 提取", cancelled=cancelled)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("PGS 提取失败：生成的 .sup 为空")
    return output


def rip_pgs(
    sup_path: Path,
    language: str,
    workdir: Path,
    engine: str | None = None,
    timeout_seconds: int = PGSRIP_TIMEOUT_SECONDS,
    heartbeat: Callable[[str], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    is_forced: bool = False,
) -> Path:
    if not PGSRIP_BIN:
        raise RuntimeError("pgsrip 未安装")

    base_command = [
        PGSRIP_BIN,
        "--force",
        "--format", "srt",
        "--no-tesseract-download",
        "--with", pgsrip_track_flag(is_forced),
    ]
    resolved_engine = normalize_engine(engine)
    if resolved_engine in {"rapidocr", "tesseract"}:
        base_command.extend(["--engine", resolved_engine])

    def execute(include_language: bool) -> tuple[str, str]:
        command = [PGSRIP_BIN]
        if include_language and language:
            command.extend(["-l", language])
        command.extend(base_command[1:])
        command.append(str(sup_path))
        return run_process(
            command,
            timeout_seconds,
            "PGS OCR",
            heartbeat=heartbeat,
            cancelled=cancelled,
            cwd=workdir,
        )

    for stale in workdir.rglob("*.srt"):
        stale.unlink(missing_ok=True)

    first_error: Exception | None = None
    try:
        stdout, stderr = execute(True)
    except Exception as exc:
        stdout, stderr = "", str(exc)
        first_error = exc

    candidates = sorted(workdir.rglob("*.srt"))
    detail = (stderr or stdout or "").strip()[-2000:]
    filtered_out = "filtered out" in detail.lower() or "0 pgs subtitle" in detail.lower()
    if not candidates and filtered_out and language:
        stdout, stderr = execute(False)
        candidates = sorted(workdir.rglob("*.srt"))
        detail = (stderr or stdout or "").strip()[-2000:]
        first_error = None
    if not candidates and first_error is not None:
        raise first_error
    if not candidates:
        raise RuntimeError(f"PGS OCR 未生成 SRT：{detail or 'pgsrip 没有输出'}")
    return candidates[0]


def pgs_result_suspicious(segments: list[dict[str, Any]], duration: float, is_forced: bool = False) -> str | None:
    if not segments:
        return "pgsrip 未生成有效字幕"
    text_chars = sum(len(str(item.get("text") or "")) for item in segments)
    if text_chars < 4:
        return "pgsrip 识别文本过少"
    minimum = 3 if is_forced else 5
    if duration >= 600 and len(segments) < minimum:
        return f"pgsrip 仅返回 {len(segments)} 条字幕，疑似不完整"
    last_end = max(float(item.get("end") or 0) for item in segments)
    if duration >= 300 and last_end < min(60.0, duration * 0.1):
        return f"pgsrip 结果疑似不完整（最后一条 {last_end:.0f}s / 总时长 {duration:.0f}s）"
    return None


def bright_mask(image: Any) -> Any:
    """Return a mask of subtitle pixels, ignoring black background and edges."""
    if image is None or image.size == 0:
        return None
    height, width = image.shape[:2]
    if height < 4 or width < 4:
        return None
    # Use max channel instead of luminance so colored DVD/VobSub subtitles survive.
    mask = (image.max(axis=2) >= 28).astype(np.uint8) * 255
    border = max(1, min(4, height // 180, width // 320))
    mask[:border, :] = 0
    mask[-border:, :] = 0
    mask[:, :border] = 0
    mask[:, -border:] = 0
    return mask


def subtitle_bbox(image: Any) -> tuple[int, int, int, int] | None:
    mask = bright_mask(image)
    if mask is None:
        return None
    count = int(cv2.countNonZero(mask))
    # ~0.008% of a 1280x720 frame: enough for a short subtitle line,
    # high enough to ignore codec noise in the black background.
    min_pixels = max(12, int(mask.size * 0.00008))
    if count < min_pixels:
        return None
    x, y, w, h = cv2.boundingRect(mask)
    if w < 6 or h < 4:
        return None
    return x, y, w, h


def frame_hash(image: Any) -> str:
    bbox = subtitle_bbox(image)
    if not bbox:
        return ""
    x, y, w, h = bbox
    crop = image[y:y + h, x:x + w]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (32, 8), interpolation=cv2.INTER_AREA)
    mean = float(small.mean())
    return ''.join('1' if value > mean else '0' for value in small.flatten())


def get_rapidocr():
    global _rapidocr_engine
    if RapidOCR is None:
        return None
    if _rapidocr_engine is None:
        _rapidocr_engine = RapidOCR()
    return _rapidocr_engine


def rapidocr_supports(language: str) -> bool:
    token = language.split("+")[0].split("-")[0].lower()
    return token in {"chi_sim", "chi_tra", "eng", "chinese", "en", "zh"}


def prepare_ocr_image(image: Any) -> tuple[Any, Any] | None:
    """Crop the subtitle area, upscale it and produce a black-text/white-bg image."""
    bbox = subtitle_bbox(image)
    if not bbox:
        return None
    x, y, w, h = bbox
    pad_x = max(4, int(w * 0.02))
    pad_y = max(4, int(h * 0.18))
    height, width = image.shape[:2]
    x0 = max(0, x - pad_x)
    y0 = max(0, y - pad_y)
    x1 = min(width, x + w + pad_x)
    y1 = min(height, y + h + pad_y)
    crop = image[y0:y1, x0:x1]
    if crop.size == 0:
        return None

    ch, cw = crop.shape[:2]
    scale = 1.0
    if ch < 72:
        scale = max(scale, min(3.0, 72.0 / max(1, ch)))
    if cw < 800:
        scale = max(scale, min(2.0, 800.0 / max(1, cw)))
    if scale > 1.01:
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    # Subtitles are normally bright text on black. Tesseract wants the inverse.
    if float(gray.mean()) < 127:
        gray = cv2.bitwise_not(gray)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(binary.mean()) < 127:
        binary = cv2.bitwise_not(binary)
    binary = cv2.copyMakeBorder(binary, 8, 8, 8, 8, cv2.BORDER_CONSTANT, value=255)
    return crop, binary


def _rapidocr_read(image: Any) -> tuple[str, float]:
    result = get_rapidocr()(image)
    if isinstance(result, tuple):
        result = result[0]
    texts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)
    if texts is None and isinstance(result, dict):
        texts = result.get("txts") or result.get("txt")
        scores = result.get("scores") or result.get("score")
    text = " ".join(str(item) for item in (texts or []) if str(item).strip()).strip()
    values = [float(value) for value in (scores or []) if value is not None]
    confidence = (sum(values) / len(values)) if values else 0.0
    return re.sub(r"\s+", " ", text).strip(), confidence


def _tesseract_read(image: Any, language: str, min_confidence: float | None = None) -> tuple[str, float]:
    threshold = float(MIN_CONFIDENCE if min_confidence is None else min_confidence)
    last_text = ""
    last_confidence = 0.0
    for psm in (6, 7):
        config = f"--oem 1 --psm {psm}"
        text = pytesseract.image_to_string(image, lang=language, config=config)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            continue
        data = pytesseract.image_to_data(image, lang=language, config=config, output_type=pytesseract.Output.DICT)
        values = []
        for value in data.get("conf", []):
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                continue
            if parsed >= 0:
                values.append(parsed)
        confidence = (sum(values) / len(values) / 100.0) if values else 0.0
        last_text = text
        last_confidence = confidence
        if confidence * 100 >= threshold:
            return text, confidence
    # 低置信度文本也保留，交给核对页高亮，不再静默丢弃。
    return last_text, last_confidence


def ocr_image(path: Path, language: str, engine: str | None = None, min_confidence: float | None = None) -> tuple[str, float]:
    image = cv2.imread(str(path))
    if image is None:
        return "", 0.0
    prepared = prepare_ocr_image(image)
    if prepared is None:
        return "", 0.0
    crop, binary = prepared
    resolved_engine = normalize_engine(engine)

    if RapidOCR is not None and resolved_engine in {"auto", "rapidocr"} and rapidocr_supports(language):
        try:
            text, confidence = _rapidocr_read(crop)
            if text:
                return text, confidence
        except Exception:
            pass

    if resolved_engine == "rapidocr":
        return "", 0.0

    try:
        return _tesseract_read(binary, tess_language(language), min_confidence)
    except Exception:
        return "", 0.0


def ocr_frames(
    path: Path,
    subtitle_index: int,
    language: str,
    duration: float,
    workdir: Path,
    progress: Callable[[int, str], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    engine: str | None = None,
    min_confidence: float | None = None,
    width: int = 1280,
    height: int = 720,
    start_seconds: float = 0.0,
    progress_range: tuple[int, int] = (0, 100),
    timeout_seconds: int = FFMPEG_TIMEOUT_SECONDS,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ffmpeg = require_tool("ffmpeg")
    frames_dir = workdir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = max(1.0, float(duration))
    start_seconds = max(0.0, float(start_seconds))
    range_start, range_end = progress_range

    def report(value: int, message: str) -> None:
        if not progress:
            return
        mapped = range_start + int((range_end - range_start) * max(0, min(100, value)) / 100)
        progress(mapped, message)

    # 固定安全文件名，避免中文/空格/特殊字符进入 filtergraph。
    source = workdir / "source.mkv"
    if not source.exists():
        os.symlink(path, source)
    report(8, "正在抽取图像字幕帧")
    # PGS/VobSub/DVD 是位图字幕，不能用 subtitles 文本滤镜。
    # 用黑色背景 + overlay 位图字幕流，按固定 FPS 输出，保持时间轴可映射。
    filter_complex = f"[0:s:{subtitle_index}][1:v]scale2ref[sub][bg];[bg][sub]overlay[out]"
    command = [ffmpeg, "-y", "-v", "error"]
    if start_seconds > 0.001:
        command.extend(["-ss", f"{start_seconds:.3f}"])
    command.extend([
        "-i", str(source),
        "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r={OCR_FPS}:d={duration:.3f}",
        "-filter_complex", filter_complex,
        "-map", "[out]", "-an", "-vsync", "cfr", "-r", str(OCR_FPS),
        "-t", f"{duration:.3f}",
        str(frames_dir / "frame_%06d.png"),
    ])
    run_process(
        command,
        timeout_seconds,
        "位图字幕抽帧",
        heartbeat=(lambda message: report(8, message)) if progress else None,
        cancelled=cancelled,
    )

    frames = sorted(frames_dir.glob("frame_*.png"))
    metadata: list[dict[str, Any]] = []
    last_hash = ""
    blank_frames = 0
    changed_frames = 0
    for index, frame in enumerate(frames):
        if cancelled and cancelled():
            raise RuntimeError("OCR 任务已取消")
        image = cv2.imread(str(frame))
        if image is None:
            continue
        digest = frame_hash(image)
        blank = not digest
        if blank:
            blank_frames += 1
            last_hash = ""
        changed = bool(digest) and digest != last_hash
        if changed:
            changed_frames += 1
            last_hash = digest
        metadata.append({
            "path": frame,
            "time": start_seconds + index / OCR_FPS,
            "blank": blank,
            "hash": digest,
            "changed": changed,
        })
        if index % max(1, len(frames) // 20) == 0:
            report(15 + int(20 * index / max(1, len(frames))), "正在检测字幕变化")

    results: dict[int, tuple[str, float]] = {}
    targets = [index for index, item in enumerate(metadata) if item["changed"]]
    empty_results = 0
    if targets:
        with ThreadPoolExecutor(max_workers=OCR_WORKERS) as executor:
            futures = {
                executor.submit(ocr_image, metadata[index]["path"], language, engine, min_confidence): index
                for index in targets
            }
            completed = 0
            for future in as_completed(futures):
                if cancelled and cancelled():
                    raise RuntimeError("OCR 任务已取消")
                index = futures[future]
                try:
                    results[index] = future.result()
                except Exception:
                    results[index] = ("", 0.0)
                if not results[index][0]:
                    empty_results += 1
                completed += 1
                report(35 + int(45 * completed / len(targets)), "正在 OCR 识别")

    frames_text: list[tuple[float, str, float]] = []
    last_ocr = ("", 0.0)
    for index, item in enumerate(metadata):
        if item["blank"]:
            text, confidence = "", 0.0
            last_ocr = ("", 0.0)
        elif index in results:
            text, confidence = results[index]
            last_ocr = (text, confidence)
        else:
            text, confidence = last_ocr
        frames_text.append((float(item["time"]), text, confidence))

    segments: list[dict[str, Any]] = []
    previous_text = ""
    active_start = start_seconds
    active_conf = 0.0
    chunk_end = start_seconds + duration
    for timestamp, text, confidence in frames_text:
        if text != previous_text:
            if previous_text:
                segments.append({
                    "id": len(segments) + 1,
                    "start": active_start,
                    "end": max(active_start + 0.3, timestamp),
                    "text": previous_text,
                    "confidence": active_conf,
                    "words": [],
                })
            previous_text = text
            active_start = timestamp
            active_conf = confidence
    if previous_text:
        segments.append({
            "id": len(segments) + 1,
            "start": active_start,
            "end": max(active_start + 0.3, min(chunk_end, active_start + 5.0)),
            "text": previous_text,
            "confidence": active_conf,
            "words": [],
        })
    report(88, "正在合并字幕时间轴")
    expected_frames = max(1, int(round(duration * OCR_FPS)))
    diagnostics = {
        "mode": "frames",
        "subtitleIndex": subtitle_index,
        "renderSize": f"{width}x{height}",
        "fps": OCR_FPS,
        "start": round(start_seconds, 3),
        "duration": round(duration, 3),
        "timeoutSeconds": timeout_seconds,
        "frames": len(metadata),
        "expectedFrames": expected_frames,
        "blankFrames": blank_frames,
        "changedFrames": changed_frames,
        "ocrCalls": len(targets),
        "emptyResults": empty_results,
        "segments": len(segments),
    }
    if len(metadata) > expected_frames * 1.5:
        diagnostics["frameOverflow"] = True
    return segments, diagnostics


def ocr_frames_chunked(
    path: Path,
    subtitle_index: int,
    language: str,
    duration: float,
    workdir: Path,
    progress: Callable[[int, str], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    engine: str | None = None,
    min_confidence: float | None = None,
    width: int = 1280,
    height: int = 720,
    chunk_seconds: int = CHUNK_SECONDS,
    chunk_retries: int = CHUNK_RETRIES,
    ffmpeg_timeout_seconds: int = FFMPEG_TIMEOUT_SECONDS,
    progress_range: tuple[int, int] = (10, 85),
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    chunks = plan_chunks(duration, chunk_seconds)
    progress_start, progress_end = progress_range
    manifest = load_manifest(workdir)
    manifest.update({
        "version": ALGORITHM_VERSION,
        "path": str(path),
        "trackIndex": subtitle_index,
        "language": language,
        "engine": engine or "",
        "duration": duration,
        "chunkSeconds": chunk_seconds,
    })
    chunk_groups: list[list[dict[str, Any]]] = []
    chunk_diagnostics: list[dict[str, Any]] = []
    reused = 0

    for index, (start, length) in enumerate(chunks):
        if cancelled and cancelled():
            raise RuntimeError("OCR 任务已取消")
        key = str(index)
        cached = manifest["chunks"].get(key)
        if cached and cached.get("status") == "done" and isinstance(cached.get("segments"), list):
            chunk_groups.append(cached["segments"])
            chunk_diagnostics.append(cached.get("diagnostics") or {})
            reused += 1
            if progress:
                progress(progress_start + int((progress_end - progress_start) * (index + 1) / len(chunks)), f"已复用第 {index + 1}/{len(chunks)} 段 OCR 结果")
            continue

        chunk_workdir = workdir / f"chunk_{index:05d}"
        range_start = progress_start + int((progress_end - progress_start) * index / len(chunks))
        range_end = progress_start + int((progress_end - progress_start) * (index + 1) / len(chunks))
        last_error: Exception | None = None
        for attempt in range(max(0, chunk_retries) + 1):
            if cancelled and cancelled():
                raise RuntimeError("OCR 任务已取消")
            try:
                segments, diagnostics = ocr_frames(
                    path,
                    subtitle_index,
                    language,
                    length,
                    chunk_workdir,
                    progress,
                    cancelled,
                    engine,
                    min_confidence,
                    width,
                    height,
                    start_seconds=start,
                    progress_range=(range_start, range_end),
                    timeout_seconds=ffmpeg_timeout_seconds,
                )
                if not segments and int(diagnostics.get("changedFrames") or 0) >= 5:
                    raise RuntimeError("该分段检测到字幕变化，但未识别出有效文本")
                manifest["chunks"][key] = {
                    "status": "done",
                    "start": start,
                    "duration": length,
                    "segments": segments,
                    "diagnostics": diagnostics,
                    "updatedAt": time.time(),
                }
                save_manifest(workdir, manifest)
                chunk_groups.append(segments)
                chunk_diagnostics.append(diagnostics)
                shutil.rmtree(chunk_workdir, ignore_errors=True)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                shutil.rmtree(chunk_workdir, ignore_errors=True)
                if cancelled and cancelled():
                    raise
        if last_error is not None:
            raise RuntimeError(f"第 {index + 1}/{len(chunks)} 段 OCR 失败：{last_error}")

    if cancelled and cancelled():
        raise RuntimeError("OCR 任务已取消")
    if progress:
        progress(min(95, progress_end + 3), "正在合并分段字幕")
    segments = merge_chunk_segments(chunk_groups, duration)
    diagnostics = {
        "mode": "frames-chunked",
        "chunkCount": len(chunks),
        "chunksCompleted": len(chunk_groups),
        "chunksReused": reused,
        "chunkSeconds": chunk_seconds,
        "duration": round(float(duration), 3),
        "segments": len(segments),
        "frames": sum(int(item.get("frames") or 0) for item in chunk_diagnostics),
        "expectedFrames": sum(int(item.get("expectedFrames") or 0) for item in chunk_diagnostics),
        "blankFrames": sum(int(item.get("blankFrames") or 0) for item in chunk_diagnostics),
        "changedFrames": sum(int(item.get("changedFrames") or 0) for item in chunk_diagnostics),
        "ocrCalls": sum(int(item.get("ocrCalls") or 0) for item in chunk_diagnostics),
        "emptyResults": sum(int(item.get("emptyResults") or 0) for item in chunk_diagnostics),
        "perChunk": chunk_diagnostics,
    }
    manifest["completedAt"] = time.time()
    save_manifest(workdir, manifest)
    return segments, diagnostics


def perform_ocr(request: OcrRequest, progress: Callable[[int, str], None] | None = None, cancelled: Callable[[], bool] | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    path = safe_path(request.path)
    max_seconds = clamp_int(request.max_seconds, MAX_SECONDS, 300)
    chunk_seconds = clamp_int(request.chunk_seconds, CHUNK_SECONDS, 300)
    pgsrip_timeout = clamp_int(request.pgsrip_timeout_seconds, PGSRIP_TIMEOUT_SECONDS, 300)
    ffmpeg_timeout = clamp_int(request.ffmpeg_timeout_seconds, FFMPEG_TIMEOUT_SECONDS, 60)
    chunk_retries = clamp_int(request.chunk_retries, CHUNK_RETRIES, 0, 5)
    resume_ttl_hours = clamp_int(request.resume_ttl_hours, RESUME_TTL_HOURS, 1)
    prune_resume_dirs(resume_ttl_hours)
    workdir = job_workdir(path, int(request.track_index), request.language, request.engine, chunk_seconds, request.min_confidence)
    workdir_lock = job_lock(workdir)
    workdir_lock.acquire()
    workdir.mkdir(parents=True, exist_ok=True)
    keep_workdir = False
    try:
        if progress:
            progress(3, "正在分析字幕轨道")
        info = probe(path, int(request.track_index))
        duration = float(info["duration"] or 0)
        if duration > max_seconds:
            raise RuntimeError(
                f"视频时长 {duration:.0f}s 超过 OCR 最大处理时长 {max_seconds}s；"
                "请在“设置 → 图像字幕 OCR → 长视频与超时”调大上限，或缩短视频"
            )

        codec = str(info["codec"]).lower()
        pgs_codec = is_pgs_codec(codec)
        is_forced_track = bool(info.get("is_forced"))
        engine = "pgsrip" if pgs_codec else "ffmpeg-ocr"
        pgs_error: str | None = None
        diagnostics: dict[str, Any] = {
            "mode": "pgsrip" if pgs_codec else "frames-chunked",
            "codec": codec,
            "subtitleIndex": int(info["subtitle_index"]),
            "trackLanguage": info.get("language") or "und",
            "trackTitle": info.get("title") or "",
            "isForced": bool(info.get("is_forced")),
            "isDefault": bool(info.get("is_default")),
            "requestedEngine": normalize_engine(request.engine),
            "renderSize": f"{info['width']}x{info['height']}",
            "duration": round(duration, 3),
            "maxSeconds": max_seconds,
            "chunkSeconds": chunk_seconds,
            "resumeTtlHours": resume_ttl_hours,
        }

        if pgs_codec:
            try:
                track_language = str(info.get("language") or "").strip()
                pgs_request_language = track_language if track_language.lower() not in {"", "und", "unknown"} else request.language
                pgs_request_language = pgs_language(pgs_request_language)
                if progress:
                    progress(18, "正在提取 PGS 字幕")
                sup_path = extract_pgs(
                    path,
                    int(info["stream_index"]),
                    workdir,
                    ffmpeg_timeout,
                    pgs_request_language,
                    is_forced_track,
                    cancelled,
                )
                diagnostics["pgsLanguage"] = pgs_request_language
                diagnostics["pgsSupFile"] = sup_path.name
                diagnostics["pgsFlag"] = pgsrip_track_flag(is_forced_track)
                if progress:
                    progress(45, "正在 OCR PGS 字幕")
                srt_path = rip_pgs(
                    sup_path,
                    pgs_request_language,
                    workdir,
                    request.engine,
                    pgsrip_timeout,
                    heartbeat=(lambda message: progress(50, message)) if progress else None,
                    cancelled=cancelled,
                    is_forced=is_forced_track,
                )
                segments = parse_srt(srt_path)
                suspicious = pgs_result_suspicious(segments, duration, is_forced_track)
                if suspicious:
                    raise RuntimeError(suspicious)
                minimum_segments = 3 if is_forced_track else 5
                if duration >= 600 and len(segments) < minimum_segments:
                    raise RuntimeError(f"pgsrip 仅返回 {len(segments)} 条字幕，疑似不完整")
                diagnostics["pgsSegments"] = len(segments)
            except Exception as exc:
                if (cancelled and cancelled()) or "OCR 任务已取消" in str(exc):
                    raise
                pgs_error = str(exc)
                if progress:
                    progress(55, f"PGS OCR 回退到分段图像识别：{pgs_error}")
                segments, frame_diagnostics = ocr_frames_chunked(
                    path,
                    int(info["subtitle_index"]),
                    pgs_request_language,
                    duration,
                    workdir,
                    progress,
                    cancelled,
                    request.engine,
                    request.min_confidence,
                    int(info["width"]),
                    int(info["height"]),
                    chunk_seconds,
                    chunk_retries,
                    ffmpeg_timeout,
                    progress_range=(55, 90),
                )
                engine = "ffmpeg-ocr"
                diagnostics.update(frame_diagnostics)
        else:
            segments, frame_diagnostics = ocr_frames_chunked(
                path,
                int(info["subtitle_index"]),
                request.language,
                duration,
                workdir,
                progress,
                cancelled,
                request.engine,
                request.min_confidence,
                int(info["width"]),
                int(info["height"]),
                chunk_seconds,
                chunk_retries,
                ffmpeg_timeout,
            )
            diagnostics.update(frame_diagnostics)

        if pgs_error:
            diagnostics["pgsError"] = pgs_error

        if not segments:
            (workdir / "manifest.json").unlink(missing_ok=True)
            raise RuntimeError("OCR 未生成有效字幕")
        minimum_segments = 3 if is_forced_track else 5
        if duration >= 600 and len(segments) < minimum_segments:
            (workdir / "manifest.json").unlink(missing_ok=True)
            track_desc = f"{info.get('language') or 'und'}{(' ' + str(info.get('title'))) if info.get('title') else ''} {'强制' if info.get('is_forced') else '非强制'}"
            raise RuntimeError(
                f"OCR 仅识别到 {len(segments)} 条字幕（视频时长 {duration:.0f}s，轨道 {track_desc}），可能选错字幕轨、字幕未渲染到画面，或 OCR 语言/引擎配置不正确；请选择完整字幕轨后重试"
            )
        if progress:
            progress(95, "正在整理 OCR 结果")
        text = " ".join(segment["text"] for segment in segments)
        confidence_values = [float(segment.get("confidence") or 0) for segment in segments if float(segment.get("confidence") or 0) > 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0
        elapsed = max(0.001, time.perf_counter() - started)
        diagnostics["segments"] = len(segments)
        diagnostics["confidence"] = confidence
        diagnostics["elapsedSeconds"] = round(elapsed, 2)
        keep_workdir = False
        return {
            "task": "ocr",
            "engine": f"ocr:{engine}",
            "provider": "ocr",
            "model": request.language,
            "device": "cpu",
            "computeType": "ocr",
            "language": request.language,
            "duration": duration,
            "elapsed": elapsed,
            "rtf": elapsed / duration if duration > 0 else 0,
            "confidence": confidence,
            "text": text,
            "segments": segments,
            "diagnostics": diagnostics,
        }
    except Exception:
        keep_workdir = not (cancelled and cancelled()) and (workdir / "manifest.json").is_file()
        raise
    finally:
        if not keep_workdir:
            shutil.rmtree(workdir, ignore_errors=True)
        workdir_lock.release()


ocr_jobs: dict[str, dict[str, Any]] = {}
ocr_cancel: set[str] = set()
ocr_jobs_lock = threading.Lock()


def prune_jobs() -> None:
    cutoff = time.time() - JOB_RETENTION_SECONDS
    with ocr_jobs_lock:
        for job_id in list(ocr_jobs.keys()):
            job = ocr_jobs[job_id]
            if job.get("finishedAt", time.time()) < cutoff:
                ocr_jobs.pop(job_id, None)
                ocr_cancel.discard(job_id)


def run_ocr_job(job_id: str, request: OcrRequest) -> None:
    with JOB_SLOTS:
        with ocr_jobs_lock:
            if job_id in ocr_cancel:
                ocr_jobs[job_id].update({
                    "status": "cancelled",
                    "error": "OCR 任务已取消",
                    "finishedAt": time.time(),
                })
                ocr_cancel.discard(job_id)
                return
            ocr_jobs[job_id].update({"status": "running", "startedAt": time.time(), "progress": 1, "message": "开始 OCR"})

        def progress(value: int, message: str) -> None:
            with ocr_jobs_lock:
                job = ocr_jobs.get(job_id)
                if job:
                    job.update({"progress": max(0, min(99, int(value))), "message": message})

        def cancelled() -> bool:
            with ocr_jobs_lock:
                return job_id in ocr_cancel

        try:
            result = perform_ocr(request, progress, cancelled)
            with ocr_jobs_lock:
                ocr_jobs[job_id].update({
                    "status": "done",
                    "progress": 100,
                    "message": "OCR 完成",
                    "finishedAt": time.time(),
                    "result": result,
                })
        except Exception as exc:
            with ocr_jobs_lock:
                ocr_jobs[job_id].update({
                    "status": "cancelled" if job_id in ocr_cancel else "error",
                    "error": str(exc),
                    "finishedAt": time.time(),
                })
        finally:
            with ocr_jobs_lock:
                ocr_cancel.discard(job_id)


@app.get("/health")
def health() -> dict[str, Any]:
    with ocr_jobs_lock:
        active_jobs = sum(1 for job in ocr_jobs.values() if job.get("status") in {"queued", "running"})
    return {
        "ok": True,
        "mediaRoot": str(MEDIA_ROOT),
        "engines": {
            "pgsrip": bool(PGSRIP_BIN),
            "ffmpeg": bool(shutil.which("ffmpeg")),
            "tesseract": bool(shutil.which("tesseract")),
        },
        "language": DEFAULT_LANGUAGE,
        "maxSeconds": MAX_SECONDS,
        "chunkSeconds": CHUNK_SECONDS,
        "pgsripTimeoutSeconds": PGSRIP_TIMEOUT_SECONDS,
        "ffmpegTimeoutSeconds": FFMPEG_TIMEOUT_SECONDS,
        "chunkRetries": CHUNK_RETRIES,
        "resumeTtlHours": RESUME_TTL_HOURS,
        "maxConcurrentJobs": MAX_CONCURRENT_JOBS,
        "minConfidence": MIN_CONFIDENCE,
        "fps": OCR_FPS,
        "workers": OCR_WORKERS,
        "engine": normalize_engine(),
        "rapidocr": RapidOCR is not None,
        "activeJobs": active_jobs,
        "languages": sorted(TESS_LANG.keys()),
    }


@app.post("/v1/subtitles/ocr", dependencies=[Depends(require_api_key)])
def ocr(request: OcrRequest) -> dict[str, Any]:
    try:
        with JOB_SLOTS:
            return perform_ocr(request)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc))[-1200:]
        raise HTTPException(status_code=500, detail=f"OCR 命令失败：{detail}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/v1/subtitles/ocr/jobs", dependencies=[Depends(require_api_key)])
def create_ocr_job(request: OcrRequest) -> dict[str, Any]:
    prune_jobs()
    job_id = uuid.uuid4().hex
    with ocr_jobs_lock:
        if len(ocr_jobs) >= MAX_JOBS:
            finished = sorted(
                (
                    (existing_id, job)
                    for existing_id, job in ocr_jobs.items()
                    if job.get("status") in {"done", "error", "cancelled"}
                ),
                key=lambda item: float(item[1].get("createdAt") or 0),
            )
            while len(ocr_jobs) >= MAX_JOBS and finished:
                existing_id, _job = finished.pop(0)
                ocr_jobs.pop(existing_id, None)
                ocr_cancel.discard(existing_id)
            if len(ocr_jobs) >= MAX_JOBS:
                raise HTTPException(status_code=429, detail="OCR 任务过多，请稍后重试")
        ocr_jobs[job_id] = {
            "jobId": job_id,
            "status": "queued",
            "progress": 0,
            "message": "排队中",
            "path": request.path,
            "trackIndex": request.track_index,
            "language": request.language,
            "createdAt": time.time(),
        }
    threading.Thread(target=run_ocr_job, args=(job_id, request), daemon=True).start()
    return {"ok": True, "jobId": job_id, "status": "queued"}


@app.get("/v1/subtitles/ocr/jobs/{job_id}", dependencies=[Depends(require_api_key)])
def get_ocr_job(job_id: str) -> dict[str, Any]:
    with ocr_jobs_lock:
        job = dict(ocr_jobs.get(job_id) or {})
    if not job:
        raise HTTPException(status_code=404, detail="OCR job not found")
    return job


@app.post("/v1/subtitles/ocr/jobs/{job_id}/cancel", dependencies=[Depends(require_api_key)])
def cancel_ocr_job(job_id: str) -> dict[str, Any]:
    with ocr_jobs_lock:
        if job_id not in ocr_jobs:
            raise HTTPException(status_code=404, detail="OCR job not found")
        ocr_cancel.add(job_id)
    return {"ok": True, "jobId": job_id}
