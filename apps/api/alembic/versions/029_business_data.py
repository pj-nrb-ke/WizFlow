"""Business data model (Phase C): entities + JSON records.

Low-code custom objects — a manager defines typed entities; records are JSON rows
(like request_data), so no per-entity DDL.

Revision ID: 029_business_data
Revises: 028_bpmn_instances
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "029_business_data"
down_revision = "028_bpmn_instances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("fields", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "slug", name="uq_business_entities_company_slug"),
    )
    op.create_table(
        "business_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("business_entities.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("business_records")
    op.drop_table("business_entities")
