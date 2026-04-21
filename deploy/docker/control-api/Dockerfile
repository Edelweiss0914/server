FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends wakeonlan \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# No pip dependencies — stdlib only
COPY cheeze-control-api.py .

EXPOSE 11436

CMD ["python3", "-u", "cheeze-control-api.py"]
