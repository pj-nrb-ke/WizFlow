"""Dynamic assignees (WF-3): users.manager_id.

Adds a nullable self-referential ``manager_id`` to ``users`` so an approval step
can route to the originator's manager. SET NULL on delete keeps the chain safe
if a manager account is removed.

Revision ID: 032_user_manager
Revises: 031_knowledge
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "032_user_manager"
down_revision = "031_knowledge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_manager_id", "users", "users", ["manager_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_manager_id", "users", type_="foreignkey")
    op.drop_column("users", "manager_id")
