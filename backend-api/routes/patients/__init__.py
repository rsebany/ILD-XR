"""
Patient CRUD: `crud` routes; `common` has ORM↔schema mapping. IDs: `services.patients.ids`.
"""
from __future__ import annotations

from .crud import router

__all__ = ["router"]
