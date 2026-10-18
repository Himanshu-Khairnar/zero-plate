# WasteLess ML service (FastAPI + LightGBM)
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libgomp is needed by LightGBM's OpenMP build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 cron \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY deploy ./deploy
RUN mkdir -p /srv/models

EXPOSE 8000

# Default: serve the API. Override the command for the jobs, e.g.
#   docker run ... python -m app.jobs.nightly_forecast
#   docker run ... python -m app.jobs.scheduler
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0", "--port", "8000"]
