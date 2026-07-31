"""add authentication fields to users

Revision ID: 015f8af4c94f
Revises: 7c8bf9b4f48b
Create Date: 2026-06-28 09:04:54.859014

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "015f8af4c94f"
down_revision: Union[str, Sequence[str], None] = "7c8bf9b4f48b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("users", sa.Column("created_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("last_seen", sa.DateTime(), nullable=True))
    op.alter_column("users", "bio", type_=sa.String(length=255))


def downgrade() -> None:
    op.alter_column("users", "bio", type_=sa.String(length=32))
    op.drop_column("users", "last_seen")
    op.drop_column("users", "updated_at")
    op.drop_column("users", "created_at")
    op.drop_column("users", "is_active")
    op.drop_column("users", "password_hash")
