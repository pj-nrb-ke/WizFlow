"""P5 version history + family_id; P6 AI metadata on definitions.

Revision ID: 004
Revises: 003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_definitions",
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("ai_generated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("ai_prompt", sa.Text(), nullable=True),
    )
    op.execute("UPDATE workflow_definitions SET family_id = id WHERE family_id IS NULL")
    op.alter_column("workflow_definitions", "family_id", nullable=False)

    op.create_table(
        "workflow_version_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workflow_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_wf_version_history_family", "workflow_version_history", ["family_id", "version"])


def downgrade() -> None:
    op.drop_table("workflow_version_history")
    op.drop_column("workflow_definitions", "ai_prompt")
    op.drop_column("workflow_definitions", "ai_generated")
    op.drop_column("workflow_definitions", "family_id")
