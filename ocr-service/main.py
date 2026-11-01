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
        "format=duration:stream=index,codec_name,codec_type:stream_disposition=default",
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
    return {
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
        "codec": str(match.get("codec_name", "")),
        "stream_index": int(match.get("index", track_index)),
    }


def pgs_language(value: str) -> str:
    return (value or DEFAULT_LANGUAGE).split("+")[0].split("-")[0]


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


def extract_pgs(path: Path, stream_index: int, workdir: Path) -> Path:
    ffmpeg = require_tool("ffmpeg")
    output = workdir / "subtitle.sup"
    subprocess.run([
        ffmpeg, "-y", "-v", "error", "-i", str(path),
        "-map", f"0:{stream_index}", "-c:s", "copy", "-f", "sup", str(output)
    ], check=True, capture_output=True, text=True, timeout=600)
    return output


def rip_pgs(sup_path: Path, language: str, workdir: Path) -> Path:
    if not PGSRIP_BIN:
        raise RuntimeError("pgsrip 未安装")
    command = [PGSRIP_BIN, "-l", language, "--force", str(sup_path)]
    subprocess.run(command, cwd=workdir, check=True, capture_output=True, text=True, timeout=60 * 60)
    candidates = sorted(workdir.glob("*.srt"))
    if not candidates:
        raise RuntimeError("PGS OCR 未生成 SRT")
    return candidates[0]


def frame_hash(image: Any) -> str:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
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


def ocr_image(path: Path, language: str) -> tuple[str, float]:
    image = cv2.imread(str(path))
    if image is None:
        return "", 0.0
    if RapidOCR is not None and OCR_ENGINE in {"auto", "rapidocr"} and language.split("+")[0].split("-")[0] in {"chi_sim", "chi_tra", "eng", "chinese", "en", "zh"}:
        try:
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
            if text and confidence >= MIN_CONFIDENCE / 100:
                return text, confidence
        except Exception:
            pass
    text = ""
    confidence = 0.0
    try:
        text = pytesseract.image_to_string(image, lang=language, config="--oem 1 --psm 6")
        data = pytesseract.image_to_data(image, lang=language, config="--oem 1 --psm 6", output_type=pytesseract.Output.DICT)
        values = []
        for value in data.get("conf", []):
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                continue
            if parsed >= 0:
                values.append(parsed)
        confidence = (sum(values) / len(values) / 100.0) if values else 0.0
    except Exception:
        return "", 0.0
    text = re.sub(r"\s+", " ", text).strip()
    if confidence * 100 < MIN_CONFIDENCE:
        text = ""
    return text, confidence


def ocr_frames(
    path: Path,
    stream_index: int,
    language: str,
    duration: float,
    workdir: Path,
    progress: Callable[[int, str], None] | None = None,
    cancelled: Callable[[], bool] | None = None
) -> list[dict[str, Any]]:
    ffmpeg = require_tool("ffmpeg")
    frames_dir = workdir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    duration = min(max(1.0, duration), float(MAX_SECONDS))
    source = workdir / path.name
    if not source.exists():
        os.symlink(path, source)
    escaped = str(source).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    filter_arg = f"subtitles=filename='{escaped}':si={stream_index}"
    if progress:
        progress(8, "正在抽取图像字幕帧")
    subprocess.run([
        ffmpeg, "-y", "-v", "error",
        "-f", "lavfi", "-i", f"color=c=black:s=1280x720:r={OCR_FPS}:d={duration}",
        "-vf", filter_arg, "-vsync", "0", str(frames_dir / "frame_%06d.png")
    ], check=True, capture_output=True, text=True, timeout=60 * 60)

    frames = sorted(frames_dir.glob("frame_*.png"))
    metadata: list[dict[str, Any]] = []
    last_hash = ""
    for index, frame in enumerate(frames):
        if cancelled and cancelled():
            raise RuntimeError("OCR 任务已取消")
        image = cv2.imread(str(frame))
        if image is None:
            continue
        blank = float(image.mean()) < 2
        digest = "" if blank else frame_hash(image)
        changed = bool(digest) and digest != last_hash
        if digest:
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
    if targets:
        with ThreadPoolExecutor(max_workers=OCR_WORKERS) as executor:
            futures = {executor.submit(ocr_image, metadata[index]["path"], language): index for index in targets}
            completed = 0
            for future in as_completed(futures):
                if cancelled and cancelled():
                    raise RuntimeError("OCR 任务已取消")
                index = futures[future]
                try:
                    results[index] = future.result()
                except Exception:
                    results[index] = ("", 0.0)
                completed += 1
                if progress:
                    progress(35 + int(45 * completed / len(targets)), "正在 OCR 识别")

    active_text = ""
    active_confidence = 0.0
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
        active_text = text
        active_confidence = confidence

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
    return segments


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
        if codec in {"hdmv_pgs_subtitle", "pgssub"}:
            try:
                if progress:
                    progress(18, "正在提取 PGS 字幕")
                sup_path = extract_pgs(path, int(info["stream_index"]), workdir)
                if progress:
                    progress(45, "正在 OCR PGS 字幕")
                srt_path = rip_pgs(sup_path, pgs_language(request.language), workdir)
                segments = parse_srt(srt_path)
                engine = "pgsrip"
            except Exception:
                segments = ocr_frames(path, int(info["stream_index"]), tess_language(request.language), duration, workdir, progress, cancelled)
                engine = "ffmpeg-tesseract"
        else:
            segments = ocr_frames(path, int(info["stream_index"]), tess_language(request.language), duration, workdir, progress, cancelled)
            engine = "ffmpeg-tesseract"
        if not segments:
            raise RuntimeError("OCR 未生成有效字幕")
        if progress:
            progress(95, "正在整理 OCR 结果")
        text = " ".join(segment["text"] for segment in segments)
        confidence_values = [float(segment.get("confidence") or 0) for segment in segments if float(segment.get("confidence") or 0) > 0]
        confidence = sum(confidence_values) / len(confidence_values) if confidence_values else 0
        elapsed = max(0.001, time.perf_counter() - started)
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
        "engine": OCR_ENGINE,
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
