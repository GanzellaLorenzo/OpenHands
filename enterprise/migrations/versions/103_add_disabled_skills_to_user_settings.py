"""Add disabled_skills to user_settings.

Revision ID: 103
Revises: 102
Create Date: 2026-02-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '103'
down_revision: Union[str, None] = '102'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_settings', sa.Column('disabled_skills', sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('user_settings', 'disabled_skills')
