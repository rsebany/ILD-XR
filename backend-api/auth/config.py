from __future__ import annotations

import os

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week
RESET_TOKEN_EXPIRE_HOURS = 1
SECRET_KEY = os.environ.get("ILD_JWT_SECRET", "ild-xr-dev-secret-change-in-production")
