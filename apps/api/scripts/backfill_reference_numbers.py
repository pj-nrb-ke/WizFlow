"""Assign reference numbers to existing requests without one.

Run: docker compose exec api python -m scripts.backfill_reference_numbers
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.db.models import WorkflowDefinition, WorkflowInstance
from app.db.session import SessionLocal
from app.services.request_serial import backfill_reference_for_instance


def main() -> None:
    db = SessionLocal()
    try:
        rows = db.scalars(
            select(WorkflowInstance).where(WorkflowInstance.reference_number.is_(None))
        )
        count = 0
        for inst in rows:
            defn = db.get(WorkflowDefinition, inst.workflow_definition_id)
            if defn:
                backfill_reference_for_instance(db, inst, defn)
                count += 1
        db.commit()
        print(f"Backfilled {count} reference number(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
