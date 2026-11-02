"""SubX OCR sidecar.

Converts PGS and bitmap subtitle tracks (VobSub/DVD) to text. PGS uses pgsrip;
bitmap fallback burns subtitles onto a black background, extracts frames, skips
duplicate frames by image hash and runs OCR in parallel. Jobs are asynchronous
and support progress plus cancellation.
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
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

MEDIA_ROOT = Path(os.getenv("OCR_MEDIA_ROOT", "/media")).resolve()
PGSRIP_BIN = shutil.which("pgsrip")
DEFAULT_LANGUAGE = os.getenv("OCR_LANGUAGE", "en")
MAX_SECONDS = int(os.getenv("OCR_MAX_SECONDS", "7200"))
MIN_CONFIDENCE = float(os.getenv("OCR_MIN_CONFIDENCE", "25"))
OCR_FPS = max(0.5, float(os.getenv("OCR_FPS", "2")))
OCR_WORKERS = max(1, int(os.getenv("OCR_WORKERS", "4")))
OCR_ENGINE = os.getenv("OCR_ENGINE", "auto")
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


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} 未安装")
    return path


def safe_path(value: str) -> Path:
    path = Path(value).resolve()
    if MEDIA_ROOT not in path.parents and path != MEDIA_ROOT:
        raise HTTPException(status_code=403, detail="媒体路径越权")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="媒体文件不存在")
    return path


def probe(path: Path, track_index: int) -> dict[str, Any]:
    ffprobe = require_tool("ffprobe")
    result = subprocess.run([
        ffprobe, "-v", "error", "-show_entries",
        "format=duration:stream=index,codec_name,codec_type,width,height:stream_disposition=default",
        "-of", "json", str(path)
    ], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
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
    return {
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
        "codec": str(match.get("codec_name", "")),
        "stream_index": int(match.get("index", track_index)),
        "subtitle_index": subtitle_index,
        "width": width,
        "height": height,
    }


def normalize_engine(value: str | None = None) -> str:
    engine = str(value or OCR_ENGINE or "auto").strip().lower()
    if engine in {"auto", "rapidocr", "tesseract"}:
        return engine
    return "auto"


def pgs_language(value: str) -> str:
    # pgsrip 接受 en / pt-BR 这类带地区的语言代码。
    return (value or DEFAULT_LANGUAGE).split("+")[0].strip() or DEFAULT_LANGUAGE


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


def extract_pgs(path: Path, stream_index: int, workdir: Path) -> Path:
    ffmpeg = require_tool("ffmpeg")
    output = workdir / "subtitle.sup"
    try:
        subprocess.run([
            ffmpeg, "-y", "-v", "error", "-i", str(path),
            "-map", f"0:{stream_index}", "-c:s", "copy", "-f", "sup", str(output)
        ], check=True, capture_output=True, text=True, timeout=600)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"PGS 提取失败：{process_error_detail(exc)}") from exc
    return output


def rip_pgs(sup_path: Path, language: str, workdir: Path, engine: str | None = None) -> Path:
    if not PGSRIP_BIN:
        raise RuntimeError("pgsrip 未安装")
    command = [
        PGSRIP_BIN,
        "-l", language,
        "--force",
        "--format", "srt",
        "--no-tesseract-download",
    ]
    resolved_engine = normalize_engine(engine)
    if resolved_engine in {"rapidocr", "tesseract"}:
        command.extend(["--engine", resolved_engine])
    command.append(str(sup_path))
    try:
        subprocess.run(command, cwd=workdir, check=True, capture_output=True, text=True, timeout=60 * 60)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"pgsrip 识别失败：{process_error_detail(exc)}") from exc
    candidates = sorted(workdir.glob("*.srt"))
    if not candidates:
        raise RuntimeError("PGS OCR 未生成 SRT")
    return candidates[0]


def pgs_result_suspicious(segments: list[dict[str, Any]], duration: float) -> str | None:
    if not segments:
        return "pgsrip 未生成有效字幕"
    text_chars = sum(len(str(item.get("text") or "")) for item in segments)
    if text_chars < 4:
        return "pgsrip 识别文本过少"
    if duration >= 600 and len(segments) < 5:
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
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ffmpeg = require_tool("ffmpeg")
    frames_dir = workdir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = min(max(1.0, duration), float(MAX_SECONDS))
    # 固定安全文件名，避免中文/空格/特殊字符进入 filtergraph。
    source = workdir / "source.mkv"
    if not source.exists():
        os.symlink(path, source)
    if progress:
        progress(8, "正在抽取图像字幕帧")
    # PGS/VobSub/DVD 是位图字幕，不能用 subtitles 文本滤镜。
    # 用黑色背景 + overlay 位图字幕流，按固定 FPS 输出，保持时间轴可映射。
    filter_complex = f"[1:v][0:s:{subtitle_index}]overlay[out]"
    command = [
        ffmpeg, "-y", "-v", "error",
        "-i", str(source),
        "-f", "lavfi", "-i", f"color=c=black:s={width}x{height}:r={OCR_FPS}:d={duration}",
        "-filter_complex", filter_complex,
        "-map", "[out]", "-an", "-vsync", "cfr", "-r", str(OCR_FPS),
        str(frames_dir / "frame_%06d.png")
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=60 * 60)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"位图字幕抽帧失败：{process_error_detail(exc)}") from exc

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
        changed = bool(digest) and digest != last_hash
        if changed:
            changed_frames += 1
            last_hash = digest
        metadata.append({
            "path": frame,
            "time": index / OCR_FPS,
            "blank": blank,
            "hash": digest,
            "changed": changed,
        })
        if progress and index % max(1, len(frames) // 20) == 0:
            progress(15 + int(20 * index / max(1, len(frames))), "正在检测字幕变化")

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
                if progress:
                    progress(35 + int(45 * completed / len(targets)), "正在 OCR 识别")

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
    active_start = 0.0
    active_conf = 0.0
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
            "end": max(active_start + 0.3, min(duration, active_start + 5.0)),
            "text": previous_text,
            "confidence": active_conf,
            "words": [],
        })
    if progress:
        progress(88, "正在合并字幕时间轴")
    expected_frames = max(1, int(round(duration * OCR_FPS)))
    diagnostics = {
        "mode": "frames",
        "subtitleIndex": subtitle_index,
        "renderSize": f"{width}x{height}",
        "fps": OCR_FPS,
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


def perform_ocr(request: OcrRequest, progress: Callable[[int, str], None] | None = None, cancelled: Callable[[], bool] | None = None) -> dict[str, Any]:
    started = time.perf_counter()
    path = safe_path(request.path)
    workdir = Path(tempfile.mkdtemp(prefix="subx-ocr-"))
    try:
        if progress:
            progress(3, "正在分析字幕轨道")
        info = probe(path, int(request.track_index))
        duration = float(info["duration"] or 0)
        if duration > MAX_SECONDS:
            raise RuntimeError(f"视频时长 {duration:.0f}s 超过 OCR_MAX_SECONDS={MAX_SECONDS}s；请调大 OCR_MAX_SECONDS 或缩短视频")
        codec = str(info["codec"]).lower()
        engine = "pgsrip" if codec in {"hdmv_pgs_subtitle", "pgssub"} else "ffmpeg-ocr"
        pgs_error: str | None = None
        diagnostics: dict[str, Any] = {
            "mode": "pgsrip" if engine == "pgsrip" else "frames",
            "codec": codec,
            "subtitleIndex": int(info["subtitle_index"]),
            "requestedEngine": normalize_engine(request.engine),
            "renderSize": f"{info['width']}x{info['height']}",
        }

        if engine == "pgsrip":
            try:
                if progress:
                    progress(18, "正在提取 PGS 字幕")
                sup_path = extract_pgs(path, int(info["stream_index"]), workdir)
                if progress:
                    progress(45, "正在 OCR PGS 字幕")
                srt_path = rip_pgs(sup_path, pgs_language(request.language), workdir, request.engine)
                segments = parse_srt(srt_path)
                suspicious = pgs_result_suspicious(segments, duration)
                if suspicious:
                    raise RuntimeError(suspicious)
                diagnostics["pgsSegments"] = len(segments)
            except Exception as exc:
                pgs_error = str(exc)
                if progress:
                    progress(50, f"PGS OCR 回退到图像识别：{pgs_error}")
                segments, frame_diagnostics = ocr_frames(
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
                )
                engine = "ffmpeg-ocr"
                diagnostics.update(frame_diagnostics)
        else:
            segments, frame_diagnostics = ocr_frames(
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
            )
            diagnostics.update(frame_diagnostics)

        if pgs_error:
            diagnostics["pgsError"] = pgs_error

        if not segments:
            raise RuntimeError("OCR 未生成有效字幕")
        if progress:
            progress(95, "正在整理 OCR 结果")
        text = " ".join(segment["text"] for segment in segments)
        confidence_values = [float(segment.get("confidence") or 0) for segment in segments if float(segment.get("confidence") or 0) > 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0
        elapsed = max(0.001, time.perf_counter() - started)
        diagnostics["segments"] = len(segments)
        diagnostics["confidence"] = confidence
        diagnostics["elapsedSeconds"] = round(elapsed, 2)
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
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


ocr_jobs: dict[str, dict[str, Any]] = {}
ocr_cancel: set[str] = set()
ocr_jobs_lock = threading.Lock()


def prune_jobs() -> None:
    cutoff = time.time() - 3600
    with ocr_jobs_lock:
        for job_id in list(ocr_jobs.keys()):
            job = ocr_jobs[job_id]
            if job.get("finishedAt", time.time()) < cutoff:
                ocr_jobs.pop(job_id, None)
                ocr_cancel.discard(job_id)


def run_ocr_job(job_id: str, request: OcrRequest) -> None:
    with ocr_jobs_lock:
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
