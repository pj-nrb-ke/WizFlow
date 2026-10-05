"""Session invalidation: users.token_version.

Adds an integer ``token_version`` to ``users`` (default 0). Tokens embed the
version they were minted at; bumping it on password reset / logout-all
invalidates every outstanding access & refresh token for that user. Default 0
keeps all existing sessions valid after deploy.

Revision ID: 026_user_token_version
Revises: 025_role_permissions
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "026_user_token_version"
down_revision = "025_role_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
