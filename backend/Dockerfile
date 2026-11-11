FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY vestro_core vestro_core
COPY backend backend
WORKDIR /app/backend
RUN useradd -m app && chown -R app /app
USER app
CMD ["sh","-c","python manage.py migrate --noinput && gunicorn vestro_api.wsgi:application -b 0.0.0.0:8000 --workers 3 --timeout 120"]
