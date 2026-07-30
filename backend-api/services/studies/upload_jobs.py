"""In-process upload/analysis jobs so Softmax does not hold the HTTP connection."""
from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_JOB_TTL_SEC = 6 * 60 * 60  # 6 hours
_lock = threading.Lock()
_jobs: dict[str, "UploadJob"] = {}


@dataclass
class UploadJob:
    id: str
    status: str = "queued"  # queued | running | done | failed
    step: str = "Queued"
    progress: float = 0.0
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


def _purge_stale_locked(now: float) -> None:
    dead = [jid for jid, job in _jobs.items() if now - job.updated_at > _JOB_TTL_SEC]
    for jid in dead:
        _jobs.pop(jid, None)


def create_job() -> UploadJob:
    job = UploadJob(id=f"job-{uuid.uuid4().hex[:12]}")
    with _lock:
        _purge_stale_locked(time.time())
        _jobs[job.id] = job
    return job


def get_job(job_id: str) -> Optional[UploadJob]:
    with _lock:
        return _jobs.get(job_id)


def update_job(
    job_id: str,
    *,
    status: Optional[str] = None,
    step: Optional[str] = None,
    progress: Optional[float] = None,
    error: Optional[str] = None,
    result: Optional[dict[str, Any]] = None,
) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        if status is not None:
            job.status = status
        if step is not None:
            job.step = step
        if progress is not None:
            job.progress = float(progress)
        if error is not None:
            job.error = error
        if result is not None:
            job.result = result
        job.updated_at = time.time()


def start_background_job(
    job_id: str,
    worker: Callable[[], None],
    *,
    name: Optional[str] = None,
) -> None:
    """Run ``worker`` in a daemon thread; mark the job failed on uncaught errors."""

    def _run() -> None:
        try:
            update_job(job_id, status="running", step="Starting AI…", progress=5.0)
            worker()
        except Exception as exc:
            logger.exception("Upload job %s failed", job_id)
            update_job(
                job_id,
                status="failed",
                step="Failed",
                progress=100.0,
                error=str(exc) or type(exc).__name__,
            )

    thread = threading.Thread(
        target=_run,
        name=name or f"upload-job-{job_id}",
        daemon=True,
    )
    thread.start()


def job_to_public_dict(job: UploadJob) -> dict[str, Any]:
    return {
        "job_id": job.id,
        "status": job.status,
        "step": job.step,
        "progress": job.progress,
        "error": job.error,
        "result": job.result,
    }


__all__ = [
    "UploadJob",
    "create_job",
    "get_job",
    "update_job",
    "start_background_job",
    "job_to_public_dict",
]
