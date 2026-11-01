"""SubX ASR service.

Runs inside the all-in-one SubX image (127.0.0.1:8000) or as an optional
standalone sidecar. Supports optional API-key authentication, resumable model
downloads, audio preprocessing fallbacks, cloud-independent transcription and
optional pyannote speaker labels. It is intended to stay on an internal Docker
network unless an auth key and reverse proxy are configured.
"""

import json
import math
import os
import platform
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import ctranslate2
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

import model_manager

try:
    from pywhispercpp.model import Model as WhisperCppModel
except Exception:
    WhisperCppModel = None

try:
    from pyannote.audio import Pipeline as DiarizationPipeline
except Exception:
    DiarizationPipeline = None

MODEL_DIR = os.getenv("ASR_MODEL_DIR", "/models")
WHISPER_CPP_MODEL_DIR = os.getenv("ASR_WHISPER_CPP_MODEL_DIR", os.path.join(MODEL_DIR, "whisper-cpp"))
DEFAULT_MODEL = os.getenv("ASR_MODEL", "small")
DEFAULT_DEVICE = os.getenv("ASR_DEVICE", "auto")
DEFAULT_COMPUTE_TYPE = os.getenv("ASR_COMPUTE_TYPE", "int8")
DEFAULT_ENGINE = os.getenv("ASR_ENGINE", "auto")
DEFAULT_PREPROCESS = os.getenv("ASR_PREPROCESS", "off")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("ASR_AVAILABLE_MODELS", "tiny,base,small,medium,large-v3,large-v3-turbo").split(",") if m.strip()]
WHISPER_CPP_MODELS = [m.strip() for m in os.getenv("ASR_WHISPER_CPP_MODELS", "tiny,base,small,medium,large-v3,large-v3-turbo").split(",") if m.strip()]

app = FastAPI(title="SubX ASR Service", version="0.3.0")
ASR_API_KEY = os.getenv("ASR_API_KEY", "")


def require_api_key(authorization: str | None = Header(None), x_api_key: str | None = Header(None)) -> None:
    if not ASR_API_KEY:
        return
    provided = authorization.replace("Bearer ", "", 1) if authorization and authorization.startswith("Bearer ") else (x_api_key or "")
    if provided != ASR_API_KEY:
        raise HTTPException(status_code=401, detail="ASR API key 无效")
_model_cache: dict[tuple[str, str, str], WhisperModel] = {}
_whisper_cpp_cache: dict[str, Any] = {}
_diarization_pipeline = None
_model_lock = threading.Lock()


def resolve_device(value: str | None = None) -> str:
    requested = str(value or DEFAULT_DEVICE or "auto").strip().lower()
    if requested in {"cuda", "cpu"}:
        return requested
    try:
        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def resolve_engine(value: str | None = None) -> str:
    engine = str(value or DEFAULT_ENGINE or "auto").strip().lower()
    if engine in {"faster-whisper", "whisper-cpp"}:
        if engine == "whisper-cpp" and WhisperCppModel is None:
            raise HTTPException(status_code=503, detail="whisper.cpp 引擎不可用，请使用包含 pywhispercpp 的 sidecar 镜像")
        return engine
    if DEFAULT_ENGINE in {"faster-whisper", "whisper-cpp"}:
        return DEFAULT_ENGINE
    return "whisper-cpp" if platform.machine().lower() in {"aarch64", "arm64", "armv7l"} else "faster-whisper"


def available_engines() -> list[str]:
    engines = ["faster-whisper"]
    if WhisperCppModel is not None:
        engines.append("whisper-cpp")
    return engines


def auto_download_enabled() -> bool:
    return bool_value(os.getenv("ASR_AUTO_DOWNLOAD"), True)


def get_model(model_name: str, device: str | None = None, compute_type: str | None = None) -> tuple[WhisperModel, str, str]:
    device = resolve_device(device)
    compute_type = str(compute_type or DEFAULT_COMPUTE_TYPE or "int8").strip().lower()
    key = (model_name, device, compute_type)
    with _model_lock:
        if key not in _model_cache:
            local_path = model_manager.local_model_path(model_name, model_manager.DownloadKind.FASTER_WHISPER)
            if local_path:
                _model_cache[key] = WhisperModel(
                    str(local_path),
                    device=device,
                    compute_type=compute_type,
                    download_root=MODEL_DIR,
                )
            elif auto_download_enabled():
                _model_cache[key] = WhisperModel(
                    model_name,
                    device=device,
                    compute_type=compute_type,
                    download_root=MODEL_DIR,
                )
            else:
                try:
                    _model_cache[key] = WhisperModel(
                        model_name,
                        device=device,
                        compute_type=compute_type,
                        download_root=MODEL_DIR,
                        local_files_only=True,
                    )
                except Exception as exc:
                    raise RuntimeError(
                        "模型未下载。请在 SubX 设置 → 语音识别 → 模型管理中手动下载，"
                        "或设置 ASR_AUTO_DOWNLOAD=true 允许首次识别时自动下载。"
                    ) from exc
    return _model_cache[key], device, compute_type


def get_whisper_cpp_model(model_name: str):
    if WhisperCppModel is None:
        raise RuntimeError("whisper.cpp 引擎不可用")
    model_name = model_name.strip() or DEFAULT_MODEL
    if not auto_download_enabled():
        model_path = model_manager.target_path(model_name, model_manager.DownloadKind.WHISPER_CPP)
        if not model_path.is_file():
            raise RuntimeError(
                "模型未下载。请在 SubX 设置 → 语音识别 → 模型管理中手动下载，"
                "或设置 ASR_AUTO_DOWNLOAD=true 允许首次识别时自动下载。"
            )
    with _model_lock:
        if model_name not in _whisper_cpp_cache:
            model_path = model_manager.target_path(model_name, model_manager.DownloadKind.WHISPER_CPP)
            source = str(model_path) if model_path.is_file() else model_name
            _whisper_cpp_cache[model_name] = WhisperCppModel(
                source,
                models_dir=WHISPER_CPP_MODEL_DIR,
                n_threads=max(1, int(os.getenv("ASR_THREADS", "0") or 0) or (os.cpu_count() or 2)),
                redirect_whispercpp_logs_to=False,
            )
    return _whisper_cpp_cache[model_name]


def bool_value(value: str | bool | None, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_diarization_pipeline():
    global _diarization_pipeline
    if DiarizationPipeline is None:
        raise RuntimeError("pyannote.audio 未安装")
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if not token:
        raise RuntimeError("未设置 HF_TOKEN，无法下载说话人分离模型")
    if _diarization_pipeline is None:
        model = os.getenv("ASR_DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
        _diarization_pipeline = DiarizationPipeline.from_pretrained(model, use_auth_token=token)
    return _diarization_pipeline


def apply_diarization(audio_path: str, segments: list[dict[str, Any]]) -> str | None:
    if not segments:
        return None
    try:
        pipeline = get_diarization_pipeline()
        output = pipeline(audio_path)
        if hasattr(output, "itertracks"):
            turns = list(output.itertracks(yield_label=True))
        else:
            diarization = getattr(output, "speaker_diarization", output)
            turns = list(diarization.itertracks(yield_label=True))
        for segment in segments:
            best_speaker = None
            best_overlap = 0.0
            for turn, _track, speaker in turns:
                overlap = max(0.0, min(float(segment["end"]), float(turn.end)) - max(float(segment["start"]), float(turn.start)))
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = str(speaker)
            if best_speaker:
                segment["speaker"] = best_speaker
        return None
    except Exception as exc:
        return f"说话人分离失败，已回退普通识别：{exc}"


def preprocess_command(mode: str) -> str | None:
    if mode == "demucs":
        return shutil.which("demucs")
    if mode == "deepfilternet":
        return shutil.which("deepFilter") or shutil.which("deep-filter")
    return None


def preprocess_audio(audio_path: str, mode: str) -> tuple[str, str | None, str | None]:
    mode = (mode or "off").strip().lower()
    if mode not in {"demucs", "deepfilternet"}:
        return audio_path, None, None
    command = preprocess_command(mode)
    if not command:
        return audio_path, None, f"{mode} 未安装，已回退原始音频"
    workdir = tempfile.mkdtemp(prefix="subx-preprocess-")
    try:
        if mode == "demucs":
            subprocess.run(
                [command, "--two-stems=vocals", "-o", workdir, audio_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=60 * 60,
            )
            candidates = list(Path(workdir).glob("**/vocals.wav"))
        else:
            subprocess.run(
                [command, audio_path, "-o", workdir],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=60 * 60,
            )
            candidates = [path for path in Path(workdir).glob("**/*") if path.suffix.lower() in {".wav", ".flac"}]
        if not candidates:
            raise RuntimeError("预处理未生成音频文件")
        return str(candidates[0]), workdir, None
    except Exception as exc:
        shutil.rmtree(workdir, ignore_errors=True)
        return audio_path, None, f"{mode} 预处理失败，已回退原始音频：{exc}"


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": resolve_engine(),
        "engines": available_engines(),
        "model": DEFAULT_MODEL,
        "device": resolve_device(),
        "computeType": DEFAULT_COMPUTE_TYPE,
        "modelsDir": MODEL_DIR,
        "whisperCppModelsDir": WHISPER_CPP_MODEL_DIR,
        "loadedModels": len(_model_cache) + len(_whisper_cpp_cache),
        "autoDownload": auto_download_enabled(),
        "preprocess": {
            "default": DEFAULT_PREPROCESS,
            "demucs": bool(preprocess_command("demucs")),
            "deepfilternet": bool(preprocess_command("deepfilternet")),
        },
        "diarization": {
            "available": DiarizationPipeline is not None,
            "model": os.getenv("ASR_DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1"),
            "requiresToken": True,
        },
    }


@app.get("/models")
def models() -> dict[str, Any]:
    engines = {
        "faster-whisper": AVAILABLE_MODELS,
        "whisper-cpp": WHISPER_CPP_MODELS if WhisperCppModel is not None else [],
    }
    installed = []
    for engine, model_list in engines.items():
        for model_name in model_list:
            installed.append(model_manager.installed_info(model_name, engine))
    return {
        "default": DEFAULT_MODEL,
        "resolvedEngine": resolve_engine(),
        "models": AVAILABLE_MODELS,
        "engines": engines,
        "installed": installed,
        "jobs": model_manager.list_jobs(),
        "imageMode": os.getenv("SUBX_ALL_IN_ONE", "false").lower() == "true",
        "autoDownload": auto_download_enabled(),
        "modelDir": str(MODEL_DIR),
        "hfEndpoint": model_manager.HF_ENDPOINT,
        "proxyConfigured": bool(model_manager.DEFAULT_PROXY),
    }


@app.post("/models/download", dependencies=[Depends(require_api_key)])
async def download_model(
    model: str = Form(...),
    engine: str | None = Form(None),
    proxy: str | None = Form(None),
    force: str | None = Form(None),
) -> dict[str, Any]:
    model_name = model.strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="model is required")
    resolved_engine = resolve_engine(engine)
    try:
        job = model_manager.start_download(
            model_name,
            resolved_engine,
            proxy=proxy,
            force=bool_value(force, False),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, **job}


@app.get("/models/download/{job_id}")
def download_status(job_id: str) -> dict[str, Any]:
    try:
        return model_manager.get_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="download job not found") from exc


@app.post("/models/download/{job_id}/pause", dependencies=[Depends(require_api_key)])
def pause_download(job_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **model_manager.pause_download(job_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="download job not found") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/models/download/{job_id}/resume", dependencies=[Depends(require_api_key)])
def resume_download(job_id: str, proxy: str | None = Form(None)) -> dict[str, Any]:
    try:
        return {"ok": True, **model_manager.resume_download(job_id, proxy=proxy)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="download job not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/models/download/{job_id}/cancel", dependencies=[Depends(require_api_key)])
def cancel_download(job_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, **model_manager.cancel_download(job_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="download job not found") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/models/delete", dependencies=[Depends(require_api_key)])
def delete_model(model: str = Form(...), engine: str | None = Form(None)) -> dict[str, Any]:
    resolved_engine = model_manager.DownloadKind.FASTER_WHISPER if engine == "cloud" else resolve_engine(engine)
    try:
        result = model_manager.delete_model(model, resolved_engine)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    with _model_lock:
        _model_cache.clear()
        _whisper_cpp_cache.clear()
    return {"ok": True, **result}


def transcribe_whisper_cpp(audio_path: str, model_name: str, language_value: str | None) -> dict[str, Any]:
    whisper = get_whisper_cpp_model(model_name)
    started = time.perf_counter()
    language_probability = 0.0
    language = language_value
    if not language:
        language, language_probability = whisper.auto_detect_language(audio_path)
    segments_result = whisper.transcribe(
        audio_path,
        language=language or "auto",
        print_progress=False,
        print_realtime=False,
        print_special=False,
    )
    segments = []
    texts = []
    for index, segment in enumerate(segments_result):
        text = str(segment.text or "").strip()
        if not text:
            continue
        start = max(0.0, float(segment.t0) / 100.0)
        end = max(start + 0.05, float(segment.t1) / 100.0)
        segments.append({
            "id": index + 1,
            "start": start,
            "end": end,
            "text": text,
            "confidence": 0.0,
            "words": [],
        })
        texts.append(text)
    elapsed = max(0.001, time.perf_counter() - started)
    duration = segments[-1]["end"] if segments else 0.0
    return {
        "task": "transcribe",
        "engine": "whisper-cpp",
        "model": model_name,
        "device": "cpu",
        "computeType": "ggml",
        "language": language or "unknown",
        "languageProbability": float(language_probability or 0),
        "duration": duration,
        "elapsed": elapsed,
        "rtf": elapsed / duration if duration > 0 else 0,
        "text": " ".join(texts),
        "segments": segments,
    }


def transcribe_faster_whisper(
    audio_path: str,
    model_name: str,
    language_value: str | None,
    vad: str | None,
    word_timestamps: str | None,
    device: str | None = None,
    compute_type: str | None = None,
) -> dict[str, Any]:
    whisper, device, compute_type = get_model(model_name, device=device, compute_type=compute_type)
    started = time.perf_counter()
    segments_iter, info = whisper.transcribe(
        audio_path,
        language=language_value,
        beam_size=5,
        vad_filter=bool_value(vad),
        word_timestamps=bool_value(word_timestamps),
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
    )

    segments = []
    texts = []
    for index, segment in enumerate(segments_iter):
        text = str(segment.text or "").strip()
        if not text:
            continue
        words = []
        for word in (segment.words or []):
            words.append({
                "start": float(word.start),
                "end": float(word.end),
                "word": str(word.word or ""),
                "probability": float(word.probability or 0),
            })
        confidence = max(0.0, min(1.0, math.exp(float(segment.avg_logprob or -10))))
        segments.append({
            "id": index + 1,
            "start": float(segment.start),
            "end": float(segment.end),
            "text": text,
            "avgLogprob": float(segment.avg_logprob or 0),
            "noSpeechProb": float(segment.no_speech_prob or 0),
            "confidence": confidence,
            "words": words,
        })
        texts.append(text)

    elapsed = max(0.001, time.perf_counter() - started)
    duration = float(getattr(info, "duration", 0) or 0)
    return {
        "task": "transcribe",
        "engine": "faster-whisper",
        "model": model_name,
        "device": device,
        "computeType": compute_type,
        "language": getattr(info, "language", language_value or "unknown"),
        "languageProbability": float(getattr(info, "language_probability", 0) or 0),
        "duration": duration,
        "elapsed": elapsed,
        "rtf": elapsed / duration if duration > 0 else 0,
        "text": " ".join(texts),
        "segments": segments,
    }


@app.post("/v1/audio/transcriptions", dependencies=[Depends(require_api_key)])
async def transcribe(
    file: UploadFile = File(...),
    model: str | None = Form(None),
    language: str | None = Form(None),
    vad: str | None = Form("true"),
    word_timestamps: str | None = Form("true"),
    device: str | None = Form(None),
    compute_type: str | None = Form(None),
    engine: str | None = Form(None),
    preprocess: str | None = Form(None),
    diarize: str | None = Form("false"),
) -> dict[str, Any]:
    model_name = (model or DEFAULT_MODEL).strip()
    language_value = (language or "auto").strip()
    if language_value.lower() in {"auto", "und", ""}:
        language_value = None
    resolved_engine = resolve_engine(engine)

    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    temp_path = None
    preprocess_dir = None
    processed_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp_path = temp.name
            while chunk := await file.read(1024 * 1024):
                temp.write(chunk)

        processed_path, preprocess_dir, preprocess_warning = preprocess_audio(temp_path, preprocess or DEFAULT_PREPROCESS)
        if resolved_engine == "whisper-cpp":
            result = transcribe_whisper_cpp(processed_path, model_name, language_value)
        else:
            result = transcribe_faster_whisper(
                processed_path,
                model_name,
                language_value,
                vad,
                word_timestamps,
                device=device,
                compute_type=compute_type,
            )
        result["preprocess"] = preprocess or DEFAULT_PREPROCESS
        if preprocess_warning:
            result["preprocessWarning"] = preprocess_warning
        if bool_value(diarize, False):
            warning = apply_diarization(processed_path, result.get("segments") or [])
            if warning:
                result["diarizationWarning"] = warning
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if preprocess_dir:
            shutil.rmtree(preprocess_dir, ignore_errors=True)
        elif processed_path and processed_path != temp_path and os.path.exists(processed_path):
            try:
                os.remove(processed_path)
            except OSError:
                pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
