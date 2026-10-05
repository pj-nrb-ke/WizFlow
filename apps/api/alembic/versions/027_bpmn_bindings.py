"""BPMN task bindings (Phase A · A1).

Adds a nullable JSONB ``bindings`` column to ``bpmn_diagrams`` holding the no-code
configuration the properties panel writes (per-task assignee/service, the request
form fields, and gateway flow conditions). Kept beside the diagram rather than in
the BPMN XML because bpmn-js drops unknown-namespace elements on round-trip.

Revision ID: 027_bpmn_bindings
Revises: 026_user_token_version
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "027_bpmn_bindings"
down_revision = "026_user_token_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bpmn_diagrams", sa.Column("bindings", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("bpmn_diagrams", "bindings")
