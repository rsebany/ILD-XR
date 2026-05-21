from __future__ import annotations
import os
from contextlib import contextmanager
from urllib.parse import urlparse, urlunparse
from typing import Iterator

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from .models import Base


# Load environment variables from .env
load_dotenv()

# Require PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required and must point to a PostgreSQL database."
    )

# creating database engine and session factory
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


def _ensure_database_exists() -> None:
    """Create the database if it does not exist (connects to default 'postgres' db)."""
    parsed = urlparse(DATABASE_URL)
    db_name = parsed.path.lstrip("/") or "postgres"
    if db_name == "postgres":
        return
    # Connect to default 'postgres' database to create the target database
    default_url = urlunparse(parsed._replace(path="/postgres"))
    default_engine = create_engine(default_url, isolation_level="AUTOCOMMIT")
    with default_engine.connect() as conn:
        row = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
        ).fetchone()
        if not row:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    default_engine.dispose()


def init_db() -> None:
    """Creates tables defined in ORM models."""
    _ensure_database_exists()
    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session() -> Iterator[Session]:
    """Context manager for database sessions."""
    session = SessionLocal()
    try:
        yield session
        if session.is_active:
            session.commit()
    except Exception:
        if session.is_active:
            session.rollback()
        raise
    finally:
        session.close()

