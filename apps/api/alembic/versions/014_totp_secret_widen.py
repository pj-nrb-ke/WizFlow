"""Widen users.totp_secret to hold encrypted (Fernet) values.

Revision ID: 014_totp_secret_widen
Revises: 013_user_totp
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "014_totp_secret_widen"
down_revision = "013_user_totp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users", "totp_secret", type_=sa.String(length=255), existing_type=sa.String(length=64)
    )


def downgrade() -> None:
    op.alter_column(
        "users", "totp_secret", type_=sa.String(length=64), existing_type=sa.String(length=255)
    )
