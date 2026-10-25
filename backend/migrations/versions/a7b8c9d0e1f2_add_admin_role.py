"""add administrator role

Revision ID: a7b8c9d0e1f2
Revises: f6f2ec6b1c95
Create Date: 2026-10-25 11:10:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6f2ec6b1c95'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_users_is_admin", "users", ["is_admin"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_is_admin", table_name="users")
    op.drop_column("users", "is_admin")
