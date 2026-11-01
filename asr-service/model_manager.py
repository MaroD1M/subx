"""Resumable model download manager for the SubX ASR service.

The main image ships the ASR runtime but not the Whisper weights. Users start
downloads explicitly from the SubX settings page. This module provides:

- Hugging Face and whisper.cpp model downloads without the Hub cache layout
- progress, speed and ETA calculation
- pause / resume / cancel / retry / delete
- HTTP(S) proxy and Hugging Face mirror support
- resumable ``.part`` files using HTTP Range requests

Only one download runs at a time. Jobs are persisted as JSON metadata in the
model directory so the UI can still show interrupted jobs after a restart.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

MODEL_DIR = Path(os.getenv("ASR_MODEL_DIR", "/models")).resolve()
WHISPER_CPP_MODEL_DIR = Path(
    os.getenv("ASR_WHISPER_CPP_MODEL_DIR", str(MODEL_DIR / "whisper-cpp"))
).resolve()
HF_ENDPOINT = (
    os.getenv("ASR_HF_ENDPOINT")
    or os.getenv("HF_ENDPOINT")
    or "https://huggingface.co"
).rstrip("/")
DEFAULT_PROXY = (os.getenv("ASR_DOWNLOAD_PROXY") or "").strip()
STATE_FILE = MODEL_DIR / ".subx-download-jobs.json"
MANIFEST_DIR = MODEL_DIR / ".subx-models"
CHUNK_SIZE = 256 * 1024
ACTIVE_STATES = {"queued", "downloading", "pausing"}
TERMINAL_STATES = {"ready", "error", "cancelled"}

WHISPER_REPOS: dict[str, str] = {
    "tiny": "Systran/faster-whisper-tiny",
    "tiny.en": "Systran/faster-whisper-tiny.en",
    "base": "Systran/faster-whisper-base",
    "base.en": "Systran/faster-whisper-base.en",
    "small": "Systran/faster-whisper-small",
    "small.en": "Systran/faster-whisper-small.en",
    "medium": "Systran/faster-whisper-medium",
    "medium.en": "Systran/faster-whisper-medium.en",
    "large-v1": "Systran/faster-whisper-large-v1",
    "large-v2": "Systran/faster-whisper-large-v2",
    "large-v3": "Systran/faster-whisper-large-v3",
    "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
}
WHISPER_CPP_FILES = {
    "tiny": "ggml-tiny.bin",
    "tiny.en": "ggml-tiny.en.bin",
    "base": "ggml-base.bin",
    "base.en": "ggml-base.en.bin",
    "small": "ggml-small.bin",
    "small.en": "ggml-small.en.bin",
    "medium": "ggml-medium.bin",
    "medium.en": "ggml-medium.en.bin",
    "large-v1": "ggml-large-v1.bin",
    "large-v2": "ggml-large-v2.bin",
    "large-v3": "ggml-large-v3.bin",
    "large-v3-turbo": "ggml-large-v3-turbo.bin",
    "turbo": "ggml-large-v3-turbo.bin",
}
WHISPER_CPP_REPO = "ggerganov/whisper.cpp"

try:  # Keep the Hub mapping in sync with the installed faster-whisper version.
    from faster_whisper.utils import _MODELS as _FASTER_WHISPER_MODELS

    for _name, _repo in _FASTER_WHISPER_MODELS.items():
        WHISPER_REPOS.setdefault(_name, _repo)
except Exception:
    pass


class DownloadPaused(Exception):
    pass


class DownloadCancelled(Exception):
    pass


class DownloadKind:
    FASTER_WHISPER = "faster-whisper"
    WHISPER_CPP = "whisper-cpp"


_lock = threading.RLock()
_jobs: dict[str, dict[str, Any]] = {}
_threads: dict[str, threading.Thread] = {}
_pause_events: dict[str, threading.Event] = {}
_cancel_events: dict[str, threading.Event] = {}
_proxies: dict[str, str] = {}
_samples: dict[str, tuple[float, int]] = {}


def _now() -> float:
    return time.time()


def _valid_model_name(model: str) -> bool:
    if not re.match(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)?$", model):
        return False
    return all(part not in {"", ".", ".."} for part in model.split("/"))


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "__", value.strip()).strip("._-")
    return (cleaned or "model")[:120]


def normalize_proxy(proxy: str | None) -> str:
    value = (proxy or "").strip()
    if not value:
        return ""
    if not re.match(r"^https?://[^/\s]+", value, flags=re.IGNORECASE):
        raise ValueError("代理地址必须以 http:// 或 https:// 开头")
    return value


def normalize_engine(engine: str | None) -> str:
    value = (engine or "faster-whisper").strip().lower()
    if value in {DownloadKind.FASTER_WHISPER, "whisper_cpp", "whispercpp", "whisper.cpp"}:
        return DownloadKind.WHISPER_CPP if "cpp" in value or "whisper." in value else DownloadKind.FASTER_WHISPER
    return DownloadKind.FASTER_WHISPER


def _repo_for(model: str) -> str:
    if "/" in model:
        return model
    if model in WHISPER_REPOS:
        return WHISPER_REPOS[model]
    return f"Systran/faster-whisper-{model}"


def _manifest_path(model: str, engine: str) -> Path:
    return MANIFEST_DIR / f"{engine}__{_safe_name(model)}.json"


def target_path(model: str, engine: str) -> Path:
    if engine == DownloadKind.WHISPER_CPP:
        filename = WHISPER_CPP_FILES.get(model) or f"ggml-{_safe_name(model)}.bin"
        return WHISPER_CPP_MODEL_DIR / filename
    return MODEL_DIR / "faster-whisper" / _safe_name(model)


def _file_url(repo: str, filename: str, revision: str = "main") -> str:
    safe_repo = repo.replace(" ", "%20")
    safe_file = filename.replace(" ", "%20")
    return f"{HF_ENDPOINT}/{safe_repo}/resolve/{revision}/{safe_file}"


def _api_url(repo: str) -> str:
    return f"{HF_ENDPOINT}/api/models/{repo.replace(' ', '%20')}?blobs=true"


def _client(proxy: str | None) -> httpx.Client:
    kwargs: dict[str, Any] = {
        "follow_redirects": True,
        "timeout": httpx.Timeout(30.0, read=120.0),
        "headers": {"User-Agent": "SubX-ModelDownloader/1.0"},
    }
    if proxy:
        kwargs["trust_env"] = False
        try:
            return httpx.Client(proxy=proxy, **kwargs)
        except TypeError:  # httpx < 0.28
            return httpx.Client(proxies=proxy, **kwargs)
    # Without an explicit proxy, honor standard HTTP(S)_PROXY / NO_PROXY envs.
    return httpx.Client(trust_env=True, **kwargs)


def _fetch_file_list(proxy: str | None, repo: str) -> list[dict[str, Any]]:
    with _client(proxy) as client:
        response = client.get(_api_url(repo))
        response.raise_for_status()
        data = response.json()
    siblings = data.get("siblings") or []
    files: list[dict[str, Any]] = []
    for item in siblings:
        filename = str(item.get("rfilename") or "").strip()
        if not filename or filename.startswith(".") or filename.lower().endswith(".md"):
            continue
        size = item.get("size")
        if size is None:
            size = (item.get("lfs") or {}).get("size")
        try:
            parsed_size = int(size) if size is not None else 0
        except (TypeError, ValueError):
            parsed_size = 0
        files.append({"filename": filename, "size": parsed_size})
    if not files:
        raise RuntimeError(f"模型仓库 {repo} 没有可下载文件")
    return files


def _whisper_cpp_file_list(model: str) -> list[dict[str, Any]]:
    filename = WHISPER_CPP_FILES.get(model) or f"ggml-{_safe_name(model)}.bin"
    return [{"filename": filename, "size": 0, "url": f"{HF_ENDPOINT}/{WHISPER_CPP_REPO}/resolve/main/{filename}"}]


def _remote_size(client: httpx.Client, url: str) -> int:
    try:
        response = client.head(url)
        size = response.headers.get("content-length")
        if response.is_success and size:
            return int(size)
    except Exception:
        pass
    try:
        with client.stream("GET", url, headers={"Range": "bytes=0-0"}) as response:
            content_range = response.headers.get("content-range") or ""
            if "/" in content_range:
                return int(content_range.rsplit("/", 1)[1])
            size = response.headers.get("content-length")
            if response.status_code == 200 and size:
                return int(size)
    except Exception:
        pass
    return 0


def _target_bytes(target: Path) -> int:
    if target.is_file():
        return target.stat().st_size
    if not target.exists():
        part = target.with_name(target.name + ".part")
        return part.stat().st_size if part.is_file() else 0
    total = 0
    for path in target.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def _read_manifest(model: str, engine: str) -> dict[str, Any] | None:
    path = _manifest_path(model, engine)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_manifest(model: str, engine: str, repo: str, files: list[dict[str, Any]], target: Path) -> None:
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "model": model,
        "engine": engine,
        "repo": repo,
        "target": str(target),
        "files": [
            {"filename": item["filename"], "size": int(item.get("size") or 0)}
            for item in files
        ],
        "completedAt": _now(),
        "totalBytes": sum(int(item.get("size") or 0) for item in files),
    }
    temp = _manifest_path(model, engine).with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, _manifest_path(model, engine))


def _legacy_hf_path(model: str) -> Path | None:
    repo = _repo_for(model)
    cache_root = MODEL_DIR / f"models--{repo.replace('/', '--')}"
    snapshots = cache_root / "snapshots"
    if not snapshots.is_dir():
        return None
    candidates = sorted(
        (path for path in snapshots.iterdir() if path.is_dir()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        if (path / "model.bin").is_file():
            return path
    return None


def _manifest_complete(manifest: dict[str, Any] | None) -> bool:
    if not manifest:
        return False
    target = Path(str(manifest.get("target") or ""))
    files = manifest.get("files") or []
    if not target.exists() or not files:
        return False
    if (manifest.get("engine") == DownloadKind.WHISPER_CPP) and target.is_file():
        return True
    if not target.is_dir():
        return False
    for item in files:
        path = target / str(item.get("filename") or "")
        if not path.is_file():
            return False
        expected = int(item.get("size") or 0)
        if expected and path.stat().st_size != expected:
            return False
    return True


def installed_info(model: str, engine: str) -> dict[str, Any]:
    manifest = _read_manifest(model, engine)
    installed = _manifest_complete(manifest)
    target = target_path(model, engine)
    resolved_path = target
    legacy = False
    if engine == DownloadKind.WHISPER_CPP and target.is_file():
        installed = True
    elif installed is False and target.exists() and (target / "model.bin").is_file():
        installed = True
        legacy = True
    elif installed is False and engine == DownloadKind.FASTER_WHISPER:
        legacy_path = _legacy_hf_path(model)
        if legacy_path:
            installed = True
            legacy = True
            resolved_path = legacy_path
    return {
        "model": model,
        "engine": engine,
        "installed": installed,
        "bytes": _target_bytes(resolved_path) if installed else 0,
        "path": str(resolved_path),
        "completedAt": manifest.get("completedAt") if manifest else None,
        "legacy": legacy,
    }


def local_model_path(model: str, engine: str) -> Path | None:
    info = installed_info(model, engine)
    if not info["installed"]:
        return None
    return Path(str(info["path"]))


def _cleanup_target(job: dict[str, Any]) -> None:
    target = Path(str(job.get("target") or "")).resolve()
    manifest = Path(str(job.get("manifest") or "")).resolve()
    try:
        allowed_roots = (MODEL_DIR, WHISPER_CPP_MODEL_DIR)
        if any(target != root and root in target.parents for root in allowed_roots):
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
            elif target.is_file():
                target.unlink(missing_ok=True)
            part = target.with_name(target.name + ".part")
            part.unlink(missing_ok=True)
        manifest.unlink(missing_ok=True)
    except OSError:
        pass


def _persist_locked() -> None:
    with _lock:
        try:
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            payload = {}
            cutoff = _now() - 7 * 24 * 3600
            for job_id, job in _jobs.items():
                created = float(job.get("createdAt") or 0)
                if job.get("status") in TERMINAL_STATES and created < cutoff:
                    continue
                payload[job_id] = {
                    key: value
                    for key, value in job.items()
                    if key not in {"speed", "etaSeconds", "percent", "downloaded"}
                }
            temp = STATE_FILE.with_suffix(".tmp")
            temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temp, STATE_FILE)
        except OSError:
            pass


def _load_jobs() -> None:
    if not STATE_FILE.is_file():
        return
    try:
        payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    for job_id, job in payload.items():
        if not isinstance(job, dict):
            continue
        model = str(job.get("model") or "").strip()
        if not _valid_model_name(model):
            continue
        engine = normalize_engine(str(job.get("engine") or ""))
        target = Path(str(job.get("target") or "")).resolve()
        if target != target_path(model, engine).resolve():
            continue
        manifest = Path(str(job.get("manifest") or "")).resolve()
        if manifest.parent != MANIFEST_DIR:
            continue
        job["model"] = model
        job["engine"] = engine
        job["repo"] = _repo_for(model) if engine != DownloadKind.WHISPER_CPP else WHISPER_CPP_REPO
        job["target"] = str(target_path(model, engine))
        job["manifest"] = str(_manifest_path(model, engine))
        status = str(job.get("status") or "error")
        if status in ACTIVE_STATES:
            status = "paused"
            job["message"] = "服务重启后已暂停，可继续下载"
        job["status"] = status
        job["downloaded"] = 0
        _jobs[job_id] = job


def _join_thread(job_id: str, timeout: float = 10.0) -> None:
    thread = _threads.get(job_id)
    if thread and thread.is_alive() and thread is not threading.current_thread():
        thread.join(timeout=timeout)


def _raise_if_stopped(job_id: str) -> None:
    if _cancel_events.get(job_id, threading.Event()).is_set():
        raise DownloadCancelled()
    if _pause_events.get(job_id, threading.Event()).is_set():
        raise DownloadPaused()


def _download_file(
    job_id: str,
    client: httpx.Client,
    url: str,
    final_path: Path,
    expected_size: int,
    job: dict[str, Any],
) -> None:
    part_path = final_path.with_name(final_path.name + ".part")
    final_path.parent.mkdir(parents=True, exist_ok=True)

    if final_path.is_file():
        size = final_path.stat().st_size
        if not expected_size or size == expected_size:
            return

    existing = part_path.stat().st_size if part_path.is_file() else 0
    if expected_size and existing == expected_size:
        os.replace(part_path, final_path)
        return
    if expected_size and existing > expected_size:
        part_path.unlink(missing_ok=True)
        existing = 0

    headers = {"Range": f"bytes={existing}-"} if existing else {}
    job["currentFile"] = final_path.name
    job["message"] = f"正在下载 {final_path.name}"
    with client.stream("GET", url, headers=headers) as response:
        if response.status_code == 416 and expected_size and existing == expected_size:
            os.replace(part_path, final_path)
            return
        response.raise_for_status()
        if existing and response.status_code == 200:
            existing = 0
        mode = "r+b" if existing else "wb"
        with open(part_path, mode) as handle:
            if existing:
                handle.seek(existing)
            for chunk in response.iter_bytes(CHUNK_SIZE):
                _raise_if_stopped(job_id)
                if chunk:
                    handle.write(chunk)

    if expected_size and part_path.stat().st_size != expected_size:
        raise RuntimeError(
            f"{final_path.name} 大小校验失败：预期 {expected_size}，实际 {part_path.stat().st_size}"
        )
    os.replace(part_path, final_path)


def _run_download(job_id: str) -> None:
    job = _jobs.get(job_id)
    if not job:
        return
    proxy = _proxies.get(job_id, "")
    try:
        _raise_if_stopped(job_id)
        engine = str(job["engine"])
        model = str(job["model"])
        repo = str(job["repo"])
        target = Path(str(job["target"]))
        job.update({
            "status": "downloading",
            "message": "正在获取模型文件列表",
            "error": None,
            "startedAt": job.get("startedAt") or _now(),
        })
        _persist_locked()

        if engine == DownloadKind.WHISPER_CPP:
            files = _whisper_cpp_file_list(model)
        else:
            files = _fetch_file_list(proxy, repo)
        if any(not int(item.get("size") or 0) for item in files):
            with _client(proxy) as size_client:
                for item in files:
                    if int(item.get("size") or 0):
                        continue
                    url = str(item.get("url") or _file_url(repo, str(item["filename"])))
                    item["size"] = _remote_size(size_client, url)
        job["filesTotal"] = len(files)
        job["filesDone"] = 0
        job["total"] = sum(int(item.get("size") or 0) for item in files)
        _persist_locked()

        with _client(proxy) as client:
            for item in files:
                _raise_if_stopped(job_id)
                filename = str(item["filename"])
                url = str(item.get("url") or _file_url(repo, filename))
                final_path = target / filename if engine != DownloadKind.WHISPER_CPP else target
                resolved_final = final_path.resolve()
                if resolved_final != target.resolve() and target.resolve() not in resolved_final.parents:
                    raise RuntimeError(f"非法模型文件路径：{filename}")
                _download_file(
                    job_id,
                    client,
                    url,
                    final_path,
                    int(item.get("size") or 0),
                    job,
                )
                job["filesDone"] = int(job.get("filesDone") or 0) + 1
                _persist_locked()

        _write_manifest(model, engine, repo, files, target)
        if engine == DownloadKind.WHISPER_CPP:
            real_target = target
        else:
            real_target = target
        job.update({
            "status": "ready",
            "message": "模型已就绪",
            "currentFile": None,
            "finishedAt": _now(),
            "downloaded": _target_bytes(real_target),
        })
    except DownloadPaused:
        job.update({"status": "paused", "message": "下载已暂停", "pausedAt": _now(), "currentFile": None})
    except DownloadCancelled:
        _cleanup_target(job)
        job.update({
            "status": "cancelled",
            "message": "下载已取消",
            "currentFile": None,
            "finishedAt": _now(),
        })
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as a job error
        job.update({
            "status": "error",
            "message": "下载失败",
            "error": str(exc),
            "currentFile": None,
            "finishedAt": _now(),
        })
    finally:
        with _lock:
            _threads.pop(job_id, None)
            _samples.pop(job_id, None)
            _persist_locked()


def _active_job_for_target(target: Path) -> dict[str, Any] | None:
    for job in _jobs.values():
        if str(job.get("status")) in ACTIVE_STATES and Path(str(job.get("target") or "")) == target:
            return job
    return None


def _active_job_any() -> dict[str, Any] | None:
    for job in _jobs.values():
        if str(job.get("status")) in ACTIVE_STATES:
            return job
    return None


def start_download(
    model: str,
    engine: str = DownloadKind.FASTER_WHISPER,
    proxy: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    model = (model or "").strip()
    if not model:
        raise ValueError("model is required")
    if not _valid_model_name(model):
        raise ValueError("模型名不合法")
    engine = normalize_engine(engine)
    proxy_value = normalize_proxy(proxy if proxy is not None else DEFAULT_PROXY)
    target = target_path(model, engine)
    if engine not in {DownloadKind.FASTER_WHISPER, DownloadKind.WHISPER_CPP}:
        raise ValueError("不支持该下载引擎")

    with _lock:
        installed = installed_info(model, engine)
        if installed["installed"] and not force:
            return {
                "jobId": "",
                "status": "ready",
                "model": model,
                "engine": engine,
                "alreadyInstalled": True,
                "downloaded": installed["bytes"],
                "total": installed["bytes"],
                "percent": 100,
                "message": "模型已安装",
            }

        active = _active_job_for_target(target)
        if active:
            return get_job(str(active["jobId"]))
        other = _active_job_any()
        if other:
            raise RuntimeError(
                f"已有模型正在下载（{other.get('model')}），请等待完成或先暂停/取消"
            )

        reusable = next(
            (
                job
                for job in _jobs.values()
                if Path(str(job.get("target") or "")) == target
                and str(job.get("status")) in {"paused", "error", "cancelled"}
            ),
            None,
        )
        if reusable:
            job_id = str(reusable["jobId"])
            job = reusable
            job.update({
                "status": "queued",
                "message": "排队中",
                "error": None,
                "currentFile": None,
                "finishedAt": None,
                "proxyConfigured": bool(proxy_value),
            })
        else:
            job_id = uuid.uuid4().hex
            job = {
                "jobId": job_id,
                "model": model,
                "engine": engine,
                "repo": _repo_for(model) if engine != DownloadKind.WHISPER_CPP else WHISPER_CPP_REPO,
                "target": str(target),
                "manifest": str(_manifest_path(model, engine)),
                "status": "queued",
                "message": "排队中",
                "createdAt": _now(),
                "startedAt": None,
                "finishedAt": None,
                "filesTotal": 0,
                "filesDone": 0,
                "total": 0,
                "currentFile": None,
                "proxyConfigured": bool(proxy_value),
                "error": None,
            }
            _jobs[job_id] = job

        _proxies[job_id] = proxy_value
        _pause_events[job_id] = threading.Event()
        _cancel_events[job_id] = threading.Event()
        _samples.pop(job_id, None)
        thread = threading.Thread(target=_run_download, args=(job_id,), daemon=True, name=f"subx-model-{model}")
        _threads[job_id] = thread
        thread.start()
        _persist_locked()
        return get_job(job_id)


def get_job(job_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        target = Path(str(job.get("target") or ""))
        downloaded = _target_bytes(target)
        total = int(job.get("total") or 0)
        status = str(job.get("status") or "")
        percent = min(100, int(downloaded * 100 / total)) if total > 0 else (100 if status == "ready" else 0)
        now = _now()
        last_at, last_bytes = _samples.get(job_id, (now, downloaded))
        speed = float(job.get("speed") or 0)
        if now - last_at >= 0.5:
            instant = max(0.0, (downloaded - last_bytes) / (now - last_at)) if now > last_at else 0.0
            if status in {"downloading", "queued"} and instant > 0:
                speed = instant
            elif status not in {"downloading", "queued"}:
                speed = 0.0
            else:
                speed *= 0.5
            _samples[job_id] = (now, downloaded)
        eta = int((total - downloaded) / speed) if speed > 0 and total > downloaded else None
        view = {
            **job,
            "downloaded": downloaded,
            "total": total,
            "percent": percent,
            "speed": round(speed, 2),
            "etaSeconds": eta,
            "active": status in ACTIVE_STATES,
        }
        return view


def list_jobs() -> list[dict[str, Any]]:
    with _lock:
        job_ids = list(_jobs.keys())
    views = []
    for job_id in job_ids:
        try:
            views.append(get_job(job_id))
        except KeyError:
            continue
    views.sort(key=lambda item: float(item.get("createdAt") or 0), reverse=True)
    return views


def pause_download(job_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if job.get("status") == "ready":
            return get_job(job_id)
        if job.get("status") not in {"queued", "downloading", "pausing"}:
            raise RuntimeError("当前任务未在下载")
        _pause_events.setdefault(job_id, threading.Event()).set()
        job.update({"status": "pausing", "message": "正在暂停"})
        _persist_locked()
    thread = _threads.get(job_id)
    if not thread or not thread.is_alive():
        with _lock:
            if job_id in _jobs:
                _jobs[job_id].update({"status": "paused", "message": "下载已暂停", "pausedAt": _now()})
                _persist_locked()
    return get_job(job_id)


def resume_download(job_id: str, proxy: str | None = None) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if job.get("status") == "ready":
            return get_job(job_id)
        if job.get("status") in ACTIVE_STATES:
            return get_job(job_id)
        if proxy is not None:
            _proxies[job_id] = normalize_proxy(proxy)
        elif job_id not in _proxies:
            _proxies[job_id] = DEFAULT_PROXY
    _join_thread(job_id)
    thread = _threads.get(job_id)
    if thread and thread.is_alive():
        return get_job(job_id)
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        target = Path(str(job.get("target") or ""))
        other = _active_job_any()
        if other and other.get("jobId") != job_id:
            raise RuntimeError(
                f"已有模型正在下载（{other.get('model')}），请等待完成或先暂停/取消"
            )
        if target.exists() and installed_info(str(job["model"]), str(job["engine"]))["installed"]:
            job.update({"status": "ready", "message": "模型已就绪", "finishedAt": _now()})
            _persist_locked()
            return get_job(job_id)
        job.update({
            "status": "queued",
            "message": "正在继续下载",
            "error": None,
            "currentFile": None,
            "proxyConfigured": bool(_proxies.get(job_id)),
        })
        _pause_events[job_id] = threading.Event()
        _cancel_events[job_id] = threading.Event()
        _samples.pop(job_id, None)
        thread = threading.Thread(target=_run_download, args=(job_id,), daemon=True, name=f"subx-model-{job['model']}")
        _threads[job_id] = thread
        thread.start()
        _persist_locked()
        return get_job(job_id)


def cancel_download(job_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if job.get("status") == "ready":
            raise RuntimeError("模型已安装，请使用卸载")
        _cancel_events.setdefault(job_id, threading.Event()).set()
        job.update({"status": "pausing", "message": "正在取消"})
        _persist_locked()
    _join_thread(job_id)
    thread = _threads.get(job_id)
    if thread and thread.is_alive():
        return get_job(job_id)
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        if job.get("status") == "ready":
            return get_job(job_id)
        _cleanup_target(job)
        job.update({
            "status": "cancelled",
            "message": "下载已取消",
            "currentFile": None,
            "finishedAt": _now(),
        })
        _persist_locked()
        return get_job(job_id)


def delete_model(model: str, engine: str = DownloadKind.FASTER_WHISPER) -> dict[str, Any]:
    model = (model or "").strip()
    if not model:
        raise ValueError("model is required")
    if not _valid_model_name(model):
        raise ValueError("模型名不合法")
    engine = normalize_engine(engine)
    target = target_path(model, engine)
    with _lock:
        active = _active_job_for_target(target)
        if active:
            raise RuntimeError("模型正在下载，请先取消")
        _cleanup_target({
            "target": str(target),
            "manifest": str(_manifest_path(model, engine)),
        })
        if engine == DownloadKind.FASTER_WHISPER:
            legacy_path = _legacy_hf_path(model)
            if legacy_path:
                cache_root = legacy_path.parents[1]
                if cache_root != MODEL_DIR and MODEL_DIR in cache_root.parents:
                    shutil.rmtree(cache_root, ignore_errors=True)
        for job_id, job in list(_jobs.items()):
            if Path(str(job.get("target") or "")) == target:
                _jobs.pop(job_id, None)
                _threads.pop(job_id, None)
                _samples.pop(job_id, None)
                _proxies.pop(job_id, None)
        _persist_locked()
    return {"ok": True, "model": model, "engine": engine}


_load_jobs()
