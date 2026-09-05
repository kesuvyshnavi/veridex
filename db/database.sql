-- server/db/database.sql
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(150) NOT NULL,
    industry VARCHAR(100) NOT NULL,
    business_model VARCHAR(100) NOT NULL,
    target_market VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    budget VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);


ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'INR';

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);

-- Every dashboard listing, report view, and delete goes through
-- "WHERE user_id = $X" — without this index Postgres does a sequential
-- scan over the whole table on every one of those queries.
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);