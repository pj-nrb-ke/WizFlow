"""Add schedule_type, recipient_user_ids, next_run_at to workflow_schedules.

Revision ID: 019_form_sending
Revises: 018_public_forms
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "019_form_sending"
down_revision = "018_public_forms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflow_schedules",
        sa.Column("schedule_type", sa.String(20), nullable=False, server_default="auto_submit"),
    )
    op.add_column(
        "workflow_schedules",
        sa.Column("recipient_user_ids", postgresql.JSONB, nullable=False, server_default="[]"),
    )
    op.add_column(
        "workflow_schedules",
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workflow_schedules", "next_run_at")
    op.drop_column("workflow_schedules", "recipient_user_ids")
    op.drop_column("workflow_schedules", "schedule_type")
