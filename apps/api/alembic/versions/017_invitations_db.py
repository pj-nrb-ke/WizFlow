"""Migrate invitations from in-memory to DB: add token_hash, invited_by_name, company_name, revoked.

Revision ID: 017_invitations_db
Revises: 016_reminder_rules
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "017_invitations_db"
down_revision = "016_reminder_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add token_hash column (hashed storage of the invite token)
    op.add_column("invitations", sa.Column("token_hash", sa.String(64), nullable=True))
    # Copy existing raw tokens into token_hash temporarily, then make non-nullable
    op.execute("UPDATE invitations SET token_hash = token")
    op.alter_column("invitations", "token_hash", nullable=False)
    op.create_unique_constraint("uq_invitations_token_hash", "invitations", ["token_hash"])

    # Drop the old raw token column
    op.drop_index("ix_invitations_token", table_name="invitations")
    op.drop_column("invitations", "token")

    # Add metadata columns needed for invite preview and pending list
    op.add_column("invitations", sa.Column("invited_by_name", sa.String(200), nullable=False, server_default=""))
    op.add_column("invitations", sa.Column("company_name", sa.String(200), nullable=False, server_default=""))
    op.add_column("invitations", sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("invitations", "revoked")
    op.drop_column("invitations", "company_name")
    op.drop_column("invitations", "invited_by_name")
    op.drop_constraint("uq_invitations_token_hash", "invitations", type_="unique")
    op.add_column("invitations", sa.Column("token", sa.String(64), nullable=True))
    op.execute("UPDATE invitations SET token = token_hash")
    op.alter_column("invitations", "token", nullable=False)
    op.create_index("ix_invitations_token", "invitations", ["token"])
    op.drop_column("invitations", "token_hash")
