FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    OCR_MEDIA_ROOT=/media \
    OCR_TEMP_DIR=/app/temp/ocr \
    OCR_LANGUAGE=en \
    OCR_MAX_SECONDS=14400 \
    OCR_CHUNK_SECONDS=1800 \
    OCR_PGSRIP_TIMEOUT_SECONDS=7200 \
    OCR_FFMPEG_TIMEOUT_SECONDS=3600 \
    OCR_CHUNK_RETRIES=1 \
    OCR_RESUME_TTL_HOURS=24 \
    OCR_MAX_CONCURRENT_JOBS=2 \
    OCR_MIN_CONFIDENCE=25 \
    OCR_FPS=2 \
    OCR_WORKERS=4 \
    OCR_ENGINE=auto \
    OCR_API_KEY=

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    mkvtoolnix \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-chi-sim \
    tesseract-ocr-chi-tra \
    tesseract-ocr-jpn \
    tesseract-ocr-kor \
    tesseract-ocr-rus \
    tesseract-ocr-fra \
    tesseract-ocr-deu \
    tesseract-ocr-spa \
    tesseract-ocr-ita \
    tesseract-ocr-por \
    tesseract-ocr-tha \
    tesseract-ocr-ara \
    tesseract-ocr-hin \
    tesseract-ocr-tur \
    tesseract-ocr-vie \
    tesseract-ocr-ukr \
    tesseract-ocr-nld \
    tesseract-ocr-pol \
    tesseract-ocr-swe \
    tesseract-ocr-dan \
    tesseract-ocr-fin \
    tesseract-ocr-nor \
    tesseract-ocr-ces \
    tesseract-ocr-ell \
    tesseract-ocr-heb \
    tesseract-ocr-ind \
    tesseract-ocr-msa \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mkdir -p /app/temp/ocr
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py ocr_utils.py ./

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
