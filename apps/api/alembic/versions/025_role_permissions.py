"""Custom-role permissions (RBAC).

Adds a nullable JSONB ``permissions`` column to ``roles``. NULL/empty means "use
the built-in default for this slug" (see app.core.permissions), so existing
built-in roles need no backfill and behaviour is unchanged. Custom roles store
their explicit permission list here.

Revision ID: 025_role_permissions
Revises: 024_bpmn_diagrams
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "025_role_permissions"
down_revision = "024_bpmn_diagrams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("roles", sa.Column("permissions", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("roles", "permissions")
