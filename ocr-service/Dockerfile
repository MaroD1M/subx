FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    OCR_MEDIA_ROOT=/media \
    OCR_LANGUAGE=en \
    OCR_MAX_SECONDS=7200 \
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
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
