"""PostgreSQL defense-in-depth RLS and least-privilege role grants.

Revision ID: 0002
Revises: 0001

Requires database roles earnscore_app and earnscore_processor, both created by
Docker initialization (or a DBA). Run migrations only as the schema owner.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

OWNED = ("worker_profiles", "consents", "income_sources", "uploads", "transactions")
DERIVED = ("assessments", "assessment_features", "risk_flags", "reports")
FINANCIAL = OWNED + DERIVED + ("lender_access", "review_requests", "lender_decisions", "audit_events")


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        # SQLite supports schema tests only, never PostgreSQL RLS.
        return

    # The migration role owns these objects. Runtime roles must NOT own them,
    # have BYPASSRLS, or be members of the owner role.
    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC")
    op.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC")
    op.execute("GRANT USAGE ON SCHEMA public TO earnscore_app, earnscore_processor")
    op.execute("GRANT SELECT ON TABLE alembic_version TO earnscore_app")
    op.execute("GRANT SELECT, INSERT, UPDATE ON TABLE users, auth_sessions TO earnscore_app")
    op.execute("GRANT SELECT ON TABLE worker_profiles, consents, income_sources, uploads, transactions TO earnscore_app")
    op.execute("GRANT INSERT, UPDATE ON TABLE worker_profiles, income_sources, uploads, transactions TO earnscore_app")
    op.execute("GRANT INSERT ON TABLE consents TO earnscore_app")
    op.execute("GRANT UPDATE (revoked_at) ON TABLE consents TO earnscore_app")
    op.execute("GRANT SELECT ON TABLE assessments, assessment_features, risk_flags, reports TO earnscore_app")
    op.execute("GRANT SELECT, INSERT ON TABLE lender_access TO earnscore_app")
    op.execute("GRANT UPDATE (revoked_at) ON TABLE lender_access TO earnscore_app")
    op.execute("GRANT SELECT, INSERT ON TABLE review_requests, lender_decisions TO earnscore_app")
    op.execute("GRANT SELECT, INSERT ON TABLE audit_events TO earnscore_app")
    op.execute("GRANT SELECT ON TABLE consents, income_sources, uploads, transactions TO earnscore_processor")
    op.execute("GRANT SELECT, INSERT, UPDATE ON TABLE assessments, assessment_features, risk_flags, reports TO earnscore_processor")
    op.execute("GRANT INSERT ON TABLE audit_events TO earnscore_processor")

    # Scope GUC is set transaction-locally by FastAPI after validating the
    # signed JWT, DB session, active user and current DB role.
    op.execute("""
        CREATE FUNCTION earnscore_actor_id() RETURNS text
        LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('app.user_id', true), '')
        $$
    """)
    op.execute("""
        CREATE FUNCTION earnscore_actor_role() RETURNS text
        LANGUAGE sql STABLE AS $$
            SELECT nullif(current_setting('app.actor_role', true), '')
        $$
    """)
    # Owner-only helper runs with table owner permissions (bypasses RLS);
    # arguments and the trusted authenticated actor are the sole inputs.
    op.execute("""
        CREATE FUNCTION earnscore_owns_assessment(p_assessment text) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public AS $$
            SELECT EXISTS (
                SELECT 1 FROM public.assessments a
                WHERE a.id = p_assessment
                  AND a.user_id = public.earnscore_actor_id()
                  AND public.earnscore_actor_role() = 'worker'
            )
        $$
    """)
    op.execute("""
        CREATE FUNCTION earnscore_can_read_assessment(p_assessment text, p_scope text)
        RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public AS $$
            SELECT public.earnscore_owns_assessment(p_assessment)
               OR (
                  public.earnscore_actor_role() = 'lender'
                  AND p_scope IN ('assessment', 'report', 'decision')
                  AND EXISTS (
                    SELECT 1 FROM public.lender_access g
                    JOIN public.consents c ON c.id = g.consent_id
                    JOIN public.assessments a ON a.id = g.assessment_id
                    JOIN public.users lender ON lender.id = g.lender_id
                    WHERE a.id = p_assessment
                      AND g.lender_id = public.earnscore_actor_id()
                      AND lender.is_active = true AND lender.role = 'lender'
                      AND g.revoked_at IS NULL AND g.expires_at > now()
                      AND c.user_id = a.user_id
                      AND c.revoked_at IS NULL
                      AND (c.expires_at IS NULL OR c.expires_at > now())
                      AND c.purposes ->> 'lender_review' = 'true'
                      AND g.scopes ->> p_scope = 'true'
                      AND c.scopes ->> p_scope = 'true'
                  )
               )
        $$
    """)
    op.execute("""
        CREATE FUNCTION earnscore_can_issue_grant(
            p_assessment text, p_consent text, p_lender text,
            p_scopes jsonb, p_expires timestamptz
        ) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public AS $$
            SELECT public.earnscore_actor_role() = 'worker'
              AND p_expires > now()
              AND jsonb_typeof(p_scopes) = 'object'
              AND EXISTS (
                SELECT 1 FROM public.assessments a
                JOIN public.consents c ON c.user_id = a.user_id
                JOIN public.users lender ON lender.id = p_lender
                WHERE a.id = p_assessment AND c.id = p_consent
                  AND a.user_id = public.earnscore_actor_id()
                  AND lender.role = 'lender' AND lender.is_active
                  AND c.revoked_at IS NULL
                  AND (c.expires_at IS NULL OR c.expires_at >= p_expires)
                  AND c.purposes ->> 'lender_review' = 'true'
                  AND EXISTS (
                    SELECT 1 FROM jsonb_each_text(p_scopes) s
                    WHERE s.key IN ('assessment','report','decision') AND s.value = 'true'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM jsonb_each_text(p_scopes) s
                    WHERE s.key NOT IN ('assessment','report','decision')
                       OR s.value NOT IN ('true','false')
                       OR (s.value = 'true' AND coalesce(c.scopes ->> s.key, 'false') <> 'true')
                  )
              )
        $$
    """)
    op.execute("REVOKE ALL ON FUNCTION earnscore_owns_assessment(text) FROM PUBLIC")
    op.execute("REVOKE ALL ON FUNCTION earnscore_can_read_assessment(text,text) FROM PUBLIC")
    op.execute("REVOKE ALL ON FUNCTION earnscore_can_issue_grant(text,text,text,jsonb,timestamptz) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION earnscore_owns_assessment(text), earnscore_can_read_assessment(text,text), earnscore_can_issue_grant(text,text,text,jsonb,timestamptz) TO earnscore_app")

    for table in FINANCIAL:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # Worker: owns source records. PostgreSQL also checks UPDATE's new row
    # against WITH CHECK; moving an owned row to another worker is blocked.
    for table in OWNED:
        op.execute(f"""
            CREATE POLICY {table}_worker_read ON {table}
            FOR SELECT TO earnscore_app
            USING (user_id = earnscore_actor_id() AND earnscore_actor_role() = 'worker')
        """)
        op.execute(f"""
            CREATE POLICY {table}_worker_insert ON {table}
            FOR INSERT TO earnscore_app
            WITH CHECK (user_id = earnscore_actor_id() AND earnscore_actor_role() = 'worker')
        """)
        op.execute(f"""
            CREATE POLICY {table}_worker_update ON {table}
            FOR UPDATE TO earnscore_app
            USING (user_id = earnscore_actor_id() AND earnscore_actor_role() = 'worker')
            WITH CHECK (user_id = earnscore_actor_id() AND earnscore_actor_role() = 'worker')
        """)
    for table in ("income_sources", "uploads", "transactions", "consents"):
        op.execute(f"CREATE POLICY {table}_processor_read ON {table} FOR SELECT TO earnscore_processor USING (true)")

    op.execute("""
        CREATE POLICY assessments_read ON assessments FOR SELECT TO earnscore_app
        USING (earnscore_can_read_assessment(id, 'assessment'))
    """)
    for table in ("assessment_features", "risk_flags"):
        op.execute(f"""
            CREATE POLICY {table}_read ON {table} FOR SELECT TO earnscore_app
            USING (earnscore_can_read_assessment(assessment_id, 'assessment'))
        """)
    op.execute("""
        CREATE POLICY reports_read ON reports FOR SELECT TO earnscore_app
        USING (earnscore_can_read_assessment(assessment_id, 'report'))
    """)
    for table in DERIVED:
        op.execute(f"CREATE POLICY {table}_processor_all ON {table} FOR ALL TO earnscore_processor USING (true) WITH CHECK (true)")

    op.execute("""
        CREATE POLICY grants_read ON lender_access FOR SELECT TO earnscore_app
        USING (earnscore_owns_assessment(assessment_id)
          OR (lender_id = earnscore_actor_id() AND earnscore_actor_role() = 'lender'
              AND revoked_at IS NULL AND expires_at > now()
              AND earnscore_can_read_assessment(assessment_id, 'assessment')))
    """)
    op.execute("""
        CREATE POLICY grants_insert ON lender_access FOR INSERT TO earnscore_app
        WITH CHECK (earnscore_can_issue_grant(assessment_id, consent_id, lender_id, scopes, expires_at))
    """)
    op.execute("""
        CREATE POLICY grants_revoke ON lender_access FOR UPDATE TO earnscore_app
        USING (earnscore_owns_assessment(assessment_id))
        WITH CHECK (earnscore_owns_assessment(assessment_id))
    """)
    for table in ("review_requests", "lender_decisions"):
        op.execute(f"""
            CREATE POLICY {table}_read ON {table} FOR SELECT TO earnscore_app
            USING (earnscore_owns_assessment(assessment_id)
                   OR (lender_id = earnscore_actor_id() AND earnscore_actor_role() = 'lender'
                       AND earnscore_can_read_assessment(assessment_id,'decision')))
        """)
        op.execute(f"""
            CREATE POLICY {table}_insert ON {table} FOR INSERT TO earnscore_app
            WITH CHECK (lender_id = earnscore_actor_id() AND earnscore_actor_role() = 'lender'
                        AND earnscore_can_read_assessment(assessment_id,'decision'))
        """)
    op.execute("""
        CREATE POLICY audit_admin_read ON audit_events FOR SELECT TO earnscore_app
        USING (earnscore_actor_role() = 'admin')
    """)
    op.execute("CREATE POLICY audit_api_insert ON audit_events FOR INSERT TO earnscore_app WITH CHECK (true)")
    op.execute("CREATE POLICY audit_processor_insert ON audit_events FOR INSERT TO earnscore_processor WITH CHECK (true)")

    # Revoke implicit CREATE from PUBLIC on schema public; runtime roles must
    # never create functions/tables or take ownership of RLS-controlled data.
    op.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in FINANCIAL:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    for name, signature in (
        ("earnscore_can_issue_grant", "text,text,text,jsonb,timestamptz"),
        ("earnscore_can_read_assessment", "text,text"),
        ("earnscore_owns_assessment", "text"),
        ("earnscore_actor_role", ""), ("earnscore_actor_id", ""),
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {name}({signature}) CASCADE")
