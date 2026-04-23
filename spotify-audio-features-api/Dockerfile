FROM python:3.14.4-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY providers ./providers
COPY data ./data

ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
