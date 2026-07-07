"""Recurring Schedules: reusable calendar rules with per-target obligations/runs.

Replaces the old recurring_activities / activity_cycles / activity_obligations
tables with recurring_schedules / schedule_targets / schedule_runs /
schedule_obligations. A dev DB may already sit at this revision with the old
tables, so upgrade() drops them (IF EXISTS) before creating the new set.

Revision ID: 022_recurring_activities
Revises: 021_checklists
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "022_recurring_activities"
down_revision = "021_checklists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the superseded tables if a dev DB already materialised them here.
    op.execute("DROP TABLE IF EXISTS activity_obligations CASCADE")
    op.execute("DROP TABLE IF EXISTS activity_cycles CASCADE")
    op.execute("DROP TABLE IF EXISTS recurring_activities CASCADE")

    op.create_table(
        "recurring_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        # Recurrence
        sa.Column("freq", sa.String(10), nullable=False, server_default="monthly"),
        sa.Column("interval", sa.Integer, nullable=False, server_default="1"),
        sa.Column("by_weekday", sa.Integer, nullable=True),
        sa.Column("by_monthday", sa.Integer, nullable=True),
        sa.Column("by_month", sa.Integer, nullable=True),
        sa.Column("at_hour", sa.Integer, nullable=False, server_default="9"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "schedule_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurring_schedules.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        # What this target runs
        sa.Column("workflow_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checklist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklists.id", ondelete="SET NULL"), nullable=True),
        # Recipients
        sa.Column("recipient_user_ids", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("recipient_group_ids", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        # Nagging
        sa.Column("remind_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("remind_interval_days", sa.Integer, nullable=False, server_default="1"),
        sa.Column("remind_max_count", sa.Integer, nullable=True, server_default="10"),
        sa.Column("remind_window_days", sa.Integer, nullable=True),
        # Escalation
        sa.Column("escalate_after_count", sa.Integer, nullable=True),
        sa.Column("supervisor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "schedule_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurring_schedules.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_targets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("period_label", sa.String(40), nullable=False, server_default=""),
        sa.Column("checklist_instance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("checklist_instances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("target_id", "due_date", name="uq_schedule_run_due"),
    )

    op.create_table(
        "schedule_obligations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurring_schedules.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_targets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_runs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="outstanding"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("instance_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_instances.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reminder_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "user_id", name="uq_schedule_obligation"),
    )


def downgrade() -> None:
    op.drop_table("schedule_obligations")
    op.drop_table("schedule_runs")
    op.drop_table("schedule_targets")
    op.drop_table("recurring_schedules")
