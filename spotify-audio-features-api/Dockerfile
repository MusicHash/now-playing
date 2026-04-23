FROM python:3.14.4-slim

WORKDIR /app

COPY spotify-audio-features-api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY spotify-audio-features-api/app.py ./app.py
COPY spotify-audio-features-api/providers ./providers
COPY spotify-audio-features-api/data ./data
COPY server/config/spotify_genres.json ./server/config/spotify_genres.json

ENV HF_HOME=/root/.cache/huggingface

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
