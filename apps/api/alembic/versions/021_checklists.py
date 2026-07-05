"""Add checklists, instances, tasks, attachments, and events tables.

Revision ID: 021_checklists
Revises: 020_guest_attachments
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "021_checklists"
down_revision = "020_guest_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "checklists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("recurrence", sa.String(20), nullable=False, server_default="none"),
        sa.Column("recurrence_config", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("carry_over", sa.String(20), nullable=False, server_default="reset"),
        sa.Column("verification_required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("verifier_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completion_rule", sa.String(20), nullable=False, server_default="all"),
        sa.Column("completion_threshold", sa.Integer, nullable=False, server_default="100"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "checklist_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "checklist_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("instance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklist_instances.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("priority", sa.String(10), nullable=False, server_default="normal"),
        sa.Column("weight", sa.Integer, nullable=False, server_default="1"),
        sa.Column("attachment_required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="not_started"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completion_channel", sa.String(20), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reject_reason", sa.Text, nullable=True),
        sa.Column("skip_reason", sa.Text, nullable=True),
        sa.Column("access_token", sa.String(64), nullable=True, unique=True, index=True),
        sa.Column("token_revoked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "checklist_task_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklist_tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "checklist_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklists.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklist_tasks.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("checklist_events")
    op.drop_table("checklist_task_attachments")
    op.drop_table("checklist_tasks")
    op.drop_table("checklist_instances")
    op.drop_table("checklists")
