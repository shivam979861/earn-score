"""Declare statement kind and retain untrusted category hints."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("uploads", sa.Column("source_kind", sa.String(16), nullable=False, server_default="unknown"))
    op.add_column("transactions", sa.Column("category_hint", sa.String(100), nullable=False, server_default=""))


def downgrade():
    op.drop_column("transactions", "category_hint")
    op.drop_column("uploads", "source_kind")
