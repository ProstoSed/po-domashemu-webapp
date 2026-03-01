FROM python:3.12-slim

WORKDIR /app

# Копируем данные (prices.json, holidays.json)
COPY data/ /app/data/

# Копируем backend
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "run.py"]
