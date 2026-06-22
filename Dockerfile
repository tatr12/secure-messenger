# Используем официальный образ Python
FROM python:3.12-slim

# Системные зависимости для сборки бинарников баз данных
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Добавили websockets и email-validator для Pydantic
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    sqlalchemy \
    asyncpg \
    redis \
    pydantic-settings \
    websockets \
    aiosmtplib \
    email-validator

COPY . .

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]