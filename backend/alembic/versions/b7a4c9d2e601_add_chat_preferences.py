"""add chat preferences

Revision ID: b7a4c9d2e601
Revises: 9d6e7f8a1b2c
Create Date: 2026-07-31 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7a4c9d2e601"
down_revision: str | Sequence[str] | None = "9d6e7f8a1b2c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_preferences",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("partner_id", sa.Integer(), nullable=False),
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "is_muted",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "is_archived",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "user_id <> partner_id",
            name="ck_chat_preferences_distinct_users",
        ),
        sa.ForeignKeyConstraint(
            ["partner_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "partner_id",
            name="uq_chat_preferences_user_partner",
        ),
    )
    op.create_index(
        op.f("ix_chat_preferences_partner_id"),
        "chat_preferences",
        ["partner_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_chat_preferences_user_id"),
        "chat_preferences",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_chat_preferences_user_id"),
        table_name="chat_preferences",
    )
    op.drop_index(
        op.f("ix_chat_preferences_partner_id"),
        table_name="chat_preferences",
    )
    op.drop_table("chat_preferences")
