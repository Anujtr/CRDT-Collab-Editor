-- PostgreSQL initialization script for CRDT Collaborative Editor
-- This script sets up the initial database configuration

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create indexes for better performance
-- These will be created by Prisma migrations, but we define them here for reference

-- Set timezone
SET timezone = 'UTC';

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE crdt_collab_editor TO crdt_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO crdt_user;

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'CRDT Collaborative Editor database initialized successfully';
END
$$;