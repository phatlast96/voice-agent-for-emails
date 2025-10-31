-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create enum types
CREATE TYPE recipient_type AS ENUM ('to', 'cc', 'bcc');
CREATE TYPE crawl_status AS ENUM ('running', 'completed', 'error');

-- Create emails table
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT,
  date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for emails table
CREATE INDEX IF NOT EXISTS idx_emails_grant_id ON emails(grant_id);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);

-- Create email_recipients table
CREATE TABLE IF NOT EXISTS email_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  type recipient_type NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for email_recipients table
CREATE INDEX IF NOT EXISTS idx_email_recipients_email_id ON email_recipients(email_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_email ON email_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_recipients_type ON email_recipients(type);

-- Create attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  is_inline BOOLEAN NOT NULL DEFAULT FALSE,
  content_id TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for attachments table
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- Create email_embeddings table
CREATE TABLE IF NOT EXISTS email_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for email_embeddings table
CREATE INDEX IF NOT EXISTS idx_email_embeddings_email_id ON email_embeddings(email_id);
CREATE INDEX IF NOT EXISTS idx_email_embeddings_chunk_index ON email_embeddings(email_id, chunk_index);

-- Create vector similarity index for email_embeddings
-- Using HNSW for better performance (requires pgvector >= 0.5.0)
-- Fallback to ivfflat if HNSW is not available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    -- Try to create HNSW index (better performance)
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_email_embeddings_vector_hnsw 
      ON email_embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to ivfflat if HNSW is not available
      CREATE INDEX IF NOT EXISTS idx_email_embeddings_vector_ivfflat 
      ON email_embeddings 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    END;
  END IF;
END $$;

-- Create attachment_embeddings table
CREATE TABLE IF NOT EXISTS attachment_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for attachment_embeddings table
CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_attachment_id ON attachment_embeddings(attachment_id);
CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_chunk_index ON attachment_embeddings(attachment_id, chunk_index);

-- Create vector similarity index for attachment_embeddings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_vector_hnsw 
      ON attachment_embeddings 
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    EXCEPTION WHEN OTHERS THEN
      CREATE INDEX IF NOT EXISTS idx_attachment_embeddings_vector_ivfflat 
      ON attachment_embeddings 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    END;
  END IF;
END $$;

-- Create crawl_jobs table
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id TEXT NOT NULL,
  status crawl_status NOT NULL,
  emails_crawled INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for crawl_jobs table
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_grant_id ON crawl_jobs(grant_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_started_at ON crawl_jobs(started_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on emails table
CREATE TRIGGER update_emails_updated_at
BEFORE UPDATE ON emails
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create storage bucket for email attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  false,
  52428800, -- 50MB in bytes
  NULL -- Allow all MIME types
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for email-attachments bucket
-- Policy: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-attachments'
);

-- Policy: Allow authenticated users to read files
CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-attachments'
);

-- Policy: Allow authenticated users to delete files
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'email-attachments'
);

-- Note: For local development, we may need to use service_role key instead of authenticated
-- The above policies can be adjusted based on authentication requirements

-- Create function for vector similarity search on email embeddings
CREATE OR REPLACE FUNCTION match_email_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  email_id text,
  chunk_text text,
  chunk_index integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ee.email_id,
    ee.chunk_text,
    ee.chunk_index,
    1 - (ee.embedding <=> query_embedding) AS similarity
  FROM email_embeddings ee
  WHERE 1 - (ee.embedding <=> query_embedding) > match_threshold
  ORDER BY ee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function for vector similarity search on attachment embeddings
CREATE OR REPLACE FUNCTION match_attachment_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  attachment_id text,
  chunk_text text,
  chunk_index integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.attachment_id,
    ae.chunk_text,
    ae.chunk_index,
    1 - (ae.embedding <=> query_embedding) AS similarity
  FROM attachment_embeddings ae
  WHERE 1 - (ae.embedding <=> query_embedding) > match_threshold
  ORDER BY ae.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

