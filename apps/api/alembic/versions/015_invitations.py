"""Add invitations table for email-based user onboarding.

Revision ID: 015_invitations
Revises: 014_totp_secret_widen
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "015_invitations"
down_revision = "014_totp_secret_widen"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role_slugs", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("invited_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invitations_token", "invitations", ["token"])
    op.create_index("ix_invitations_company_email", "invitations", ["company_id", "email"])


def downgrade() -> None:
    op.drop_index("ix_invitations_company_email", table_name="invitations")
    op.drop_index("ix_invitations_token", table_name="invitations")
    op.drop_table("invitations")
