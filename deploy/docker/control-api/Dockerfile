FROM python:3.11-slim

WORKDIR /app

# No pip dependencies — stdlib only
COPY cheeze-control-api.py .

EXPOSE 11436

CMD ["python3", "-u", "cheeze-control-api.py"]
