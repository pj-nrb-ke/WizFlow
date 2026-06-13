"""Add TOTP 2FA fields to users.

Revision ID: 013_user_totp
Revises: 012_phase2_complete
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "013_user_totp"
down_revision = "012_phase2_complete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column(
        "users",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
