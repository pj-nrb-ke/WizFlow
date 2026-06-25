"""Add public_form_tokens and guest_submissions tables.

Revision ID: 018_public_forms
Revises: 017_invitations_db
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "018_public_forms"
down_revision = "017_invitations_db"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "public_form_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_definition_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_public_form_tokens_token", "public_form_tokens", ["token"])
    op.create_index("ix_public_form_tokens_workflow", "public_form_tokens",
                    ["company_id", "workflow_definition_id"])

    op.create_table(
        "guest_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_definition_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("public_form_tokens.id", ondelete="SET NULL"), nullable=True),
        sa.Column("guest_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("guest_email", sa.String(255), nullable=False, server_default=""),
        sa.Column("data", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_guest_submissions_workflow", "guest_submissions",
                    ["company_id", "workflow_definition_id"])
    op.create_index("ix_guest_submissions_status", "guest_submissions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_guest_submissions_status", table_name="guest_submissions")
    op.drop_index("ix_guest_submissions_workflow", table_name="guest_submissions")
    op.drop_table("guest_submissions")
    op.drop_index("ix_public_form_tokens_workflow", table_name="public_form_tokens")
    op.drop_index("ix_public_form_tokens_token", table_name="public_form_tokens")
    op.drop_table("public_form_tokens")
