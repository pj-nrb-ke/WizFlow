"""AI control plane (D1): per-company governance + per-call audit/cost log.

Revision ID: 030_ai_control_plane
Revises: 029_business_data
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "030_ai_control_plane"
down_revision = "029_business_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_governance",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ai_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("monthly_budget_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("disabled_tasks", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", name="uq_ai_governance_company"),
    )
    op.create_index("ix_ai_governance_company_id", "ai_governance", ["company_id"])

    op.create_table(
        "ai_call_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True),
        sa.Column("task", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False, server_default=""),
        sa.Column("model", sa.String(80), nullable=False, server_default=""),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ok", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ai_call_logs_company_id", "ai_call_logs", ["company_id"])
    op.create_index("ix_ai_call_logs_task", "ai_call_logs", ["task"])
    op.create_index("ix_ai_call_logs_created_at", "ai_call_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("ai_call_logs")
    op.drop_table("ai_governance")
