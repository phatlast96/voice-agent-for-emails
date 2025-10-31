import OpenAI from 'openai';
import { createSupabaseClient } from '../supabase';
import { chunkText } from './attachment-extractor';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

/**
 * Generate embeddings for email content and save to database
 * @param emailId - Email ID
 * @param subject - Email subject
 * @param body - Email body text
 */
export async function generateEmailEmbeddings(
  emailId: string,
  subject: string,
  body: string = ''
): Promise<void> {
  const supabase = createSupabaseClient();
  
  // Combine subject and body for embedding
  const fullText = `${subject}\n\n${body}`.trim();
  
  if (!fullText) {
    console.warn(`No text content for email ${emailId}, skipping embedding generation`);
    return;
  }

  // Check if embeddings already exist for this email
  const { data: existingEmbeddings } = await supabase
    .from('email_embeddings')
    .select('id')
    .eq('email_id', emailId)
    .limit(1);

  if (existingEmbeddings && existingEmbeddings.length > 0) {
    console.log(`Embeddings already exist for email ${emailId}, skipping`);
    return;
  }

  // Chunk the text if needed
  const chunks = chunkText(fullText, 8000, 200);

  try {
    // Generate embeddings for all chunks in parallel
    const embeddingPromises = chunks.map(async (chunk, index) => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
        input: chunk,
      });

      return {
        email_id: emailId,
        chunk_text: chunk,
        chunk_index: index,
        embedding: response.data[0].embedding,
      };
    });

    const embeddings = await Promise.all(embeddingPromises);

    // Batch insert embeddings
    const { error } = await supabase.from('email_embeddings').insert(embeddings);

    if (error) {
      console.error(`Error saving embeddings for email ${emailId}:`, error);
      throw error;
    }

    console.log(`Generated and saved ${embeddings.length} embeddings for email ${emailId}`);
  } catch (error) {
    console.error(`Error generating embeddings for email ${emailId}:`, error);
    throw error;
  }
}

/**
 * Generate embeddings for attachment content and save to database
 * @param attachmentId - Attachment ID
 * @param text - Extracted text from attachment
 */
export async function generateAttachmentEmbeddings(
  attachmentId: string,
  text: string
): Promise<void> {
  const supabase = createSupabaseClient();

  if (!text || text.trim().length === 0) {
    console.warn(`No text content for attachment ${attachmentId}, skipping embedding generation`);
    return;
  }

  // Check if embeddings already exist for this attachment
  const { data: existingEmbeddings } = await supabase
    .from('attachment_embeddings')
    .select('id')
    .eq('attachment_id', attachmentId)
    .limit(1);

  if (existingEmbeddings && existingEmbeddings.length > 0) {
    console.log(`Embeddings already exist for attachment ${attachmentId}, skipping`);
    return;
  }

  // Chunk the text if needed
  const chunks = chunkText(text, 8000, 200);

  try {
    // Generate embeddings for all chunks in parallel
    const embeddingPromises = chunks.map(async (chunk, index) => {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
        input: chunk,
      });

      return {
        attachment_id: attachmentId,
        chunk_text: chunk,
        chunk_index: index,
        embedding: response.data[0].embedding,
      };
    });

    const embeddings = await Promise.all(embeddingPromises);

    // Batch insert embeddings
    const { error } = await supabase.from('attachment_embeddings').insert(embeddings);

    if (error) {
      console.error(`Error saving embeddings for attachment ${attachmentId}:`, error);
      throw error;
    }

    console.log(`Generated and saved ${embeddings.length} embeddings for attachment ${attachmentId}`);
  } catch (error) {
    console.error(`Error generating embeddings for attachment ${attachmentId}:`, error);
    throw error;
  }
}

/**
 * Generate embedding for a query string (for semantic search)
 * @param query - Query text
 * @returns Embedding vector
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

