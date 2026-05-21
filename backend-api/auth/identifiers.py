from __future__ import annotations

import uuid


def _generate_medical_id() -> str:
    """Generate unique Medical ID for practitioners: ILD-2026-XXXX."""
    suffix = uuid.uuid4().hex[:8].upper()
    return f"ILD-2026-{suffix}"
