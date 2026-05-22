"""Org tables and workflow_events definition link.

Revision ID: 002
Revises: 001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_departments_company_name"),
    )
    op.create_index("ix_departments_company_id", "departments", ["company_id"])

    op.create_table(
        "branches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("company_id", "name", name="uq_branches_company_name"),
    )
    op.create_index("ix_branches_company_id", "branches", ["company_id"])

    op.add_column(
        "workflow_events",
        sa.Column("workflow_definition_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_workflow_events_definition",
        "workflow_events",
        "workflow_definitions",
        ["workflow_definition_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column("workflow_events", "instance_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)


def downgrade() -> None:
    op.alter_column("workflow_events", "instance_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_constraint("fk_workflow_events_definition", "workflow_events", type_="foreignkey")
    op.drop_column("workflow_events", "workflow_definition_id")
    op.drop_table("branches")
    op.drop_table("departments")
