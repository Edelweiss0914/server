FROM python:3.11-slim

WORKDIR /app

# No pip dependencies — stdlib only
COPY cheeze-portal-api.py .
COPY generate-control-token.py .

EXPOSE 11437

CMD ["python3", "-u", "cheeze-portal-api.py"]
