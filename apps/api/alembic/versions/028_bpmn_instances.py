"""Native BPMN instances (Phase B).

Stores running native-BPMN apps (SpiffWorkflow serialized state), separate from
workflow_instances so the linear approval engine is untouched.

Revision ID: 028_bpmn_instances
Revises: 027_bpmn_bindings
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "028_bpmn_instances"
down_revision = "027_bpmn_bindings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bpmn_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "diagram_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bpmn_diagrams.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="running"),
        sa.Column("spiff_state", sa.Text(), nullable=True),
        sa.Column(
            "originator_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("bpmn_instances")
