FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for aiosqlite
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (Tsinghua mirror + BuildKit cache mount:
# cached wheels survive layer invalidation; no --no-cache-dir or the mount stays empty)
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

# Copy application code
COPY app/ ./app/

# Expose API port
EXPOSE 8001

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
