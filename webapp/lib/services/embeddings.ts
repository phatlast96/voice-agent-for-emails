import OpenAI from 'openai';
import { createSupabaseClient } from '../supabase';
import { chunkText } from './attachment-extractor';

/**
 * Create OpenAI client instance with API key
 */
function createOpenAIClient(apiKey: string): OpenAI {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('OpenAI API key is required');
  }
  return new OpenAI({ apiKey });
}

/**
 * Generate embeddings for email content and save to database
 * @param emailId - Email ID
 * @param subject - Email subject
 * @param body - Email body text
 * @param openaiApiKey - OpenAI API key
 */
export async function generateEmailEmbeddings(
  emailId: string,
  subject: string,
  body: string = '',
  openaiApiKey: string
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
    const openai = createOpenAIClient(openaiApiKey);
    
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
 * @param openaiApiKey - OpenAI API key
 */
export async function generateAttachmentEmbeddings(
  attachmentId: string,
  text: string,
  openaiApiKey: string
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
    const openai = createOpenAIClient(openaiApiKey);
    
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
 * @param openaiApiKey - OpenAI API key
 * @returns Embedding vector
 */
export async function generateQueryEmbedding(query: string, openaiApiKey: string): Promise<number[]> {
  try {
    const openai = createOpenAIClient(openaiApiKey);
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

