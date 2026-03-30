"""Store conversation feedback event IDs as strings

Revision ID: 105
Revises: 104
Create Date: 2026-03-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '105'
down_revision = '104'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'conversation_feedback',
        sa.Column('metadata', sa.JSON(), nullable=True),
    )
    op.alter_column(
        'conversation_feedback',
        'event_id',
        existing_type=sa.Integer(),
        type_=sa.String(),
        existing_nullable=True,
        postgresql_using='event_id::text',
    )


def downgrade() -> None:
    op.alter_column(
        'conversation_feedback',
        'event_id',
        existing_type=sa.String(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using='event_id::integer',
    )
    op.drop_column('conversation_feedback', 'metadata')
