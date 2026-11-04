"""Persist cleaned CSV imports, without retaining raw uploaded statements.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    doc = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    for name, typ, default in (
        ("filename", sa.String(160), "statement.csv"),
        ("row_count", sa.Integer(), "0"),
        ("valid_count", sa.Integer(), "0"),
        ("invalid_count", sa.Integer(), "0"),
        ("review_count", sa.Integer(), "0"),
        ("duplicate_count", sa.Integer(), "0"),
        ("column_mapping", doc, "'{}'"),
        ("invalid_rows", doc, "'[]'"),
    ):
        op.add_column("uploads", sa.Column(name, typ, nullable=False, server_default=sa.text(default if default[0] == "'" else f"'{default}'")))
    with op.batch_alter_table("uploads") as batch:
        batch.create_unique_constraint("uq_upload_user_hash", ["user_id", "file_hash"])

    for name, typ, default in (
        ("description", sa.String(250), "''"),
        ("source_name", sa.String(100), "'Unspecified'"),
        ("transaction_ref", sa.String(100), "''"),
        ("source_line", sa.Integer(), None),
        ("fingerprint", sa.String(64), None),
        ("reference_key", sa.String(64), None),
        ("review_reasons", doc, "'[]'"),
        ("potential_duplicate", sa.Boolean(), "false"),
        ("verification_status", sa.String(24), "'unverified'"),
    ):
        op.add_column("transactions", sa.Column(name, typ,
            nullable=name in ("source_line", "fingerprint", "reference_key"),
            server_default=sa.text(default) if default is not None else None))
    op.create_index("ix_transactions_owner_fingerprint", "transactions", ["user_id", "fingerprint"])
    op.create_index("ix_transactions_owner_reference", "transactions", ["user_id", "reference_key"])


def downgrade():
    op.drop_index("ix_transactions_owner_reference", table_name="transactions")
    op.drop_index("ix_transactions_owner_fingerprint", table_name="transactions")
    for name in ("verification_status", "potential_duplicate", "review_reasons", "reference_key", "fingerprint", "source_line", "transaction_ref", "source_name", "description"):
        op.drop_column("transactions", name)
    with op.batch_alter_table("uploads") as batch:
        batch.drop_constraint("uq_upload_user_hash", type_="unique")
    for name in ("invalid_rows", "column_mapping", "duplicate_count", "review_count", "invalid_count", "valid_count", "row_count", "filename"):
        op.drop_column("uploads", name)
