import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

API_ROOT = Path(__file__).resolve().parents[2] / "apps" / "api"
sys.path.insert(0, str(API_ROOT))


def _database_available() -> bool:
    url = os.environ.get("DATABASE_URL") or os.environ.get(
        "TEST_DATABASE_URL", "postgresql://wizflow:wizflow@localhost:5433/wizflow_dev"
    )
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def db_available() -> bool:
    return _database_available()


@pytest.fixture(autouse=True)
def require_database(db_available: bool) -> None:
    if not db_available:
        pytest.skip("PostgreSQL not available — start infra/docker or set DATABASE_URL")
