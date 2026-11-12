FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY vestro_core /app/vestro_core
COPY backend /app/backend
RUN chmod -R g=u /app
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn vestro_api.wsgi:application -b 0.0.0.0:8000 --workers 2 --timeout 120"]
