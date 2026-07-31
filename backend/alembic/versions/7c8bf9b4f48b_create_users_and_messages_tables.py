"""create users and messages tables

Revision ID: 7c8bf9b4f48b
Revises:
Create Date: 2026-06-28 08:08:46.509783

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "7c8bf9b4f48b"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("bio", sa.String(length=32), nullable=False),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("public_key", sa.JSON(), nullable=False),
        sa.Column("encrypted_private_key", sa.Text(), nullable=False),
        sa.Column("private_key_iv", sa.Text(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(
        op.f("ix_users_username"),
        "users",
        ["username"],
        unique=True,
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sender", sa.String(), nullable=False),
        sa.Column("receiver", sa.String(), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("iv", sa.Text(), nullable=False),
        sa.Column("time_str", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_messages_receiver"),
        "messages",
        ["receiver"],
        unique=False,
    )
    op.create_index(
        op.f("ix_messages_sender"),
        "messages",
        ["sender"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_messages_sender"), table_name="messages")
    op.drop_index(op.f("ix_messages_receiver"), table_name="messages")
    op.drop_table("messages")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
