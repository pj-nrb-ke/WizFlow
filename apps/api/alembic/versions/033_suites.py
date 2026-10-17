"""Suites: group published processes into a no-code "application" launcher.

Adds ``suites`` (the branded container) and ``suite_items`` (ordered member
processes, referenced by workflow ``family_id``). Both are company-scoped and
cascade on company delete; items cascade on suite delete.

Revision ID: 033_suites
Revises: 032_user_manager
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "033_suites"
down_revision = "032_user_manager"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(40), nullable=True),
        sa.Column("accent", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft", index=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_id", "slug", name="uq_suites_company_slug"),
    )
    op.create_table(
        "suite_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "suite_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("suites.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("suite_id", "family_id", name="uq_suite_items_suite_family"),
    )


def downgrade() -> None:
    op.drop_table("suite_items")
    op.drop_table("suites")
