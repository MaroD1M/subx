"""Pure helpers for OCR chunk planning and subtitle merging."""

from __future__ import annotations

from typing import Any, Iterable

PGS_CODECS = {"hdmv_pgs_subtitle", "pgssub"}


def is_pgs_codec(codec: str) -> bool:
    return str(codec or "").lower() in PGS_CODECS


def clamp_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def plan_chunks(duration: float, chunk_seconds: float) -> list[tuple[float, float]]:
    total = max(1.0, float(duration or 0))
    size = max(30.0, float(chunk_seconds or 0))
    if total <= size:
        return [(0.0, total)]

    chunks: list[tuple[float, float]] = []
    start = 0.0
    while start < total - 0.001:
        length = min(size, total - start)
        chunks.append((round(start, 3), round(length, 3)))
        start += length
    return chunks


def merge_chunk_segments(
    chunk_segments: Iterable[Iterable[dict[str, Any]]],
    duration: float,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    total = max(0.0, float(duration or 0))
    for group in chunk_segments:
        for segment in group:
            text = str(segment.get("text") or "").strip()
            if not text:
                continue
            start = max(0.0, float(segment.get("start") or 0))
            end = max(start + 0.3, float(segment.get("end") or 0))
            if total > 0:
                start = min(start, total)
                end = min(max(start + 0.3, end), total)
            if end <= start:
                continue
            merged.append({
                **segment,
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
            })

    merged.sort(key=lambda item: (item["start"], item["end"]))
    result: list[dict[str, Any]] = []
    for segment in merged:
        if not result:
            result.append(segment)
            continue
        previous = result[-1]
        if segment["text"] == previous["text"] and segment["start"] <= previous["end"] + 0.5:
            previous["end"] = round(max(previous["end"], segment["end"]), 3)
            previous["confidence"] = max(
                float(previous.get("confidence") or 0),
                float(segment.get("confidence") or 0),
            )
            continue
        if segment["start"] < previous["end"]:
            previous["end"] = round(max(previous["start"] + 0.3, segment["start"]), 3)
            if previous["end"] <= previous["start"] + 0.05:
                previous["end"] = round(previous["start"] + 0.3, 3)
        result.append(segment)

    for index, segment in enumerate(result, start=1):
        segment["id"] = index
        segment["words"] = segment.get("words") or []
    return result
