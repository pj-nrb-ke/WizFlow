"""Request reference numbers per workflow family (MIS).

Revision ID: 006
Revises: 005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workflow_instances",
        sa.Column("reference_number", sa.String(40), nullable=True),
    )
    op.create_index(
        "ix_instances_reference_number",
        "workflow_instances",
        ["company_id", "reference_number"],
        unique=True,
    )

    op.create_table(
        "request_serial_sequences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "company_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("next_value", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint(
            "company_id", "family_id", "year", name="uq_serial_company_family_year"
        ),
    )


def downgrade() -> None:
    op.drop_table("request_serial_sequences")
    op.drop_index("ix_instances_reference_number", table_name="workflow_instances")
    op.drop_column("workflow_instances", "reference_number")
