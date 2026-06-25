"""Add guest_attachments table for public form file uploads.

Revision ID: 020_guest_attachments
Revises: 019_form_sending
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "020_guest_attachments"
down_revision = "019_form_sending"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "guest_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "guest_submission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("guest_submissions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "token_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public_form_tokens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("field_key", sa.String(100), nullable=False, server_default=""),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_guest_attachments_submission", "guest_attachments", ["guest_submission_id"])


def downgrade() -> None:
    op.drop_index("ix_guest_attachments_submission", table_name="guest_attachments")
    op.drop_table("guest_attachments")
