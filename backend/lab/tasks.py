from celery import shared_task
from .services import execute_run

@shared_task
def run_assessment_task(run_id): execute_run(run_id)
