-- EarnScore PostgreSQL reference DDL (not a replacement for Alembic migrations).
-- Generated from SQLAlchemy models after migration 0003_csv_imports.
-- Runtime role GRANTs and RLS policies live in 0002_access_policies.py.
-- Use `alembic upgrade head` as earnscore_owner instead.


CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	full_name VARCHAR(160) NOT NULL, 
	password_hash TEXT NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_users_role CHECK (role IN ('worker','lender','admin'))
)

;
CREATE UNIQUE INDEX ix_users_email ON users (email);
CREATE INDEX ix_users_role ON users (role);


CREATE TABLE assessments (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	model_version VARCHAR(30) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	score INTEGER, 
	evidence_confidence VARCHAR(30), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_assessment_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 1000)), 
	CONSTRAINT ck_assessment_status CHECK (status IN ('pending','incomplete','completed','superseded','failed')), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_assessments_user_id ON assessments (user_id);


CREATE TABLE audit_events (
	id VARCHAR(36) NOT NULL, 
	actor_id VARCHAR(36), 
	action VARCHAR(100) NOT NULL, 
	resource_id VARCHAR(36), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(actor_id) REFERENCES users (id)
)

;


CREATE TABLE auth_sessions (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_sessions_expiry CHECK (expires_at > created_at), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);


CREATE TABLE consents (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	purposes JSONB NOT NULL, 
	scopes JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_consents_expiry CHECK (expires_at IS NULL OR expires_at > created_at), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_consents_user_id ON consents (user_id);


CREATE TABLE income_sources (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	provider VARCHAR(100) NOT NULL, 
	source_type VARCHAR(40) NOT NULL, 
	verification_status VARCHAR(30) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_income_source_owner UNIQUE (id, user_id), 
	CONSTRAINT ck_source_verification CHECK (verification_status IN ('self_reported','pending','verified','rejected')), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_income_sources_user_id ON income_sources (user_id);


CREATE TABLE uploads (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	file_hash VARCHAR(64) NOT NULL, 
	storage_key TEXT NOT NULL, 
	filename VARCHAR(160) NOT NULL, 
	row_count INTEGER NOT NULL, 
	valid_count INTEGER NOT NULL, 
	invalid_count INTEGER NOT NULL, 
	review_count INTEGER NOT NULL, 
	duplicate_count INTEGER NOT NULL, 
	column_mapping JSONB NOT NULL, 
	invalid_rows JSONB NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_upload_owner UNIQUE (id, user_id), 
	CONSTRAINT uq_upload_user_hash UNIQUE (user_id, file_hash), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_uploads_user_id ON uploads (user_id);


CREATE TABLE worker_profiles (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	occupation VARCHAR(100), 
	primary_platform VARCHAR(100), 
	profile_status VARCHAR(30) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE UNIQUE INDEX ix_worker_profiles_user_id ON worker_profiles (user_id);


CREATE TABLE assessment_features (
	id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	feature_name VARCHAR(100) NOT NULL, 
	value JSONB NOT NULL, 
	provenance JSONB NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_assessment_feature_name UNIQUE (assessment_id, feature_name), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;
CREATE INDEX ix_assessment_features_assessment_id ON assessment_features (assessment_id);


CREATE TABLE lender_access (
	id VARCHAR(36) NOT NULL, 
	lender_id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	consent_id VARCHAR(36) NOT NULL, 
	scopes JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	revoked_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_grant_expiry CHECK (expires_at > created_at), 
	FOREIGN KEY(lender_id) REFERENCES users (id), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id), 
	FOREIGN KEY(consent_id) REFERENCES consents (id)
)

;
CREATE INDEX ix_lender_access_assessment_id ON lender_access (assessment_id);
CREATE INDEX ix_lender_access_consent_id ON lender_access (consent_id);
CREATE INDEX ix_lender_access_lender_id ON lender_access (lender_id);


CREATE TABLE lender_decisions (
	id VARCHAR(36) NOT NULL, 
	lender_id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	outcome VARCHAR(30) NOT NULL, 
	reasons JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_decision_outcome CHECK (outcome IN ('approved','declined','on_hold')), 
	FOREIGN KEY(lender_id) REFERENCES users (id), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;
CREATE INDEX ix_lender_decisions_assessment_id ON lender_decisions (assessment_id);
CREATE INDEX ix_lender_decisions_lender_id ON lender_decisions (lender_id);


CREATE TABLE reports (
	id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	version INTEGER NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_report_assessment_version UNIQUE (assessment_id, version), 
	CONSTRAINT ck_report_status CHECK (status IN ('draft','ready','superseded','withdrawn')), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;
CREATE INDEX ix_reports_assessment_id ON reports (assessment_id);


CREATE TABLE review_requests (
	id VARCHAR(36) NOT NULL, 
	lender_id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	request_details TEXT NOT NULL, 
	status VARCHAR(25) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_review_status CHECK (status IN ('open','fulfilled','cancelled')), 
	FOREIGN KEY(lender_id) REFERENCES users (id), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;
CREATE INDEX ix_review_requests_assessment_id ON review_requests (assessment_id);
CREATE INDEX ix_review_requests_lender_id ON review_requests (lender_id);


CREATE TABLE risk_flags (
	id VARCHAR(36) NOT NULL, 
	assessment_id VARCHAR(36) NOT NULL, 
	category VARCHAR(60) NOT NULL, 
	severity VARCHAR(25) NOT NULL, 
	explanation TEXT NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_risk_severity CHECK (severity IN ('info','low','medium','high','critical')), 
	FOREIGN KEY(assessment_id) REFERENCES assessments (id)
)

;
CREATE INDEX ix_risk_flags_assessment_id ON risk_flags (assessment_id);


CREATE TABLE transactions (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	income_source_id VARCHAR(36), 
	upload_id VARCHAR(36), 
	amount NUMERIC(14, 2) NOT NULL, 
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	classification VARCHAR(50) NOT NULL, 
	evidence_ref TEXT, 
	description VARCHAR(250) NOT NULL, 
	source_name VARCHAR(100) NOT NULL, 
	transaction_ref VARCHAR(100) NOT NULL, 
	source_line INTEGER, 
	fingerprint VARCHAR(64), 
	reference_key VARCHAR(64), 
	review_reasons JSONB NOT NULL, 
	potential_duplicate BOOLEAN NOT NULL, 
	verification_status VARCHAR(24) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT fk_transaction_source_same_owner FOREIGN KEY(income_source_id, user_id) REFERENCES income_sources (id, user_id), 
	CONSTRAINT fk_transaction_upload_same_owner FOREIGN KEY(upload_id, user_id) REFERENCES uploads (id, user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;
CREATE INDEX ix_transactions_owner_date ON transactions (user_id, occurred_at);
CREATE INDEX ix_transactions_owner_fingerprint ON transactions (user_id, fingerprint);
CREATE INDEX ix_transactions_owner_reference ON transactions (user_id, reference_key);
CREATE INDEX ix_transactions_user_id ON transactions (user_id);

