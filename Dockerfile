FROM python:3.11

WORKDIR /app
COPY . .
RUN pip install -r backend/requirements.txt

CMD uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
