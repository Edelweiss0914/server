FROM python:3.11-slim

WORKDIR /app

# No pip dependencies — stdlib only
COPY cheeze-ai-queue.py .

EXPOSE 11435

CMD ["python3", "-u", "cheeze-ai-queue.py"]
