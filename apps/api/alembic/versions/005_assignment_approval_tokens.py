"""Named-user assignment modes, claim state, approval tokens, round-robin.

Revision ID: 005
Revises: 004
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_instances",
        sa.Column("assignment_mode", sa.String(30), nullable=True),
    )
    op.add_column(
        "workflow_instances",
        sa.Column("claimed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_instances_claimed_by",
        "workflow_instances",
        "users",
        ["claimed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "approval_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "instance_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_instances.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_id", sa.String(100), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "assignment_round_robin_state",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_id", sa.String(100), nullable=False),
        sa.Column("next_index", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint(
            "company_id", "family_id", "step_id", name="uq_rr_company_family_step"
        ),
    )


def downgrade() -> None:
    op.drop_table("assignment_round_robin_state")
    op.drop_table("approval_tokens")
    op.drop_constraint("fk_instances_claimed_by", "workflow_instances", type_="foreignkey")
    op.drop_column("workflow_instances", "claimed_by_user_id")
    op.drop_column("workflow_instances", "assignment_mode")
