"""add message delivery metadata

Revision ID: 9d6e7f8a1b2c
Revises: 3f4d1c2b8a91
Create Date: 2026-07-31 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9d6e7f8a1b2c"
down_revision: str | Sequence[str] | None = "3f4d1c2b8a91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("client_message_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "messages",
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "messages",
        sa.Column("read_at", sa.DateTime(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_messages_sender_client_message_id",
        "messages",
        ["sender", "client_message_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_messages_sender_client_message_id",
        "messages",
        type_="unique",
    )
    op.drop_column("messages", "read_at")
    op.drop_column("messages", "delivered_at")
    op.drop_column("messages", "client_message_id")
