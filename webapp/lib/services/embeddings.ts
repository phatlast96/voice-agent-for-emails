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
 * Retry function with exponential backoff for rate limit errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error (429)
      if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
        // Extract retry delay from error message if available
        let delay = initialDelay * Math.pow(2, attempt);
        
        // Try to extract retry-after from error response headers
        if (error?.headers?.['retry-after']) {
          delay = parseInt(error.headers['retry-after']) * 1000;
        } else {
          // Try to extract delay from error message (check multiple possible locations)
          const errorMessage = error?.error?.message || error?.message || '';
          const delayMatch = errorMessage.match(/try again in (\d+)\s*(ms|seconds?)/i);
          if (delayMatch) {
            const delayValue = parseInt(delayMatch[1]);
            const unit = delayMatch[2]?.toLowerCase();
            delay = unit?.startsWith('ms') ? delayValue : delayValue * 1000;
          }
        }
        
        // Cap the delay at 60 seconds, minimum 100ms
        delay = Math.max(100, Math.min(delay, 60000));
        
        if (attempt < maxRetries - 1) {
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Check if it's a token limit error (400) - need to handle chunk size
      if (error?.status === 400 && error?.error?.message?.includes('maximum context length')) {
        console.error(`Token limit exceeded - chunk is too large`);
        throw new Error(`Chunk size exceeds token limit. Please reduce chunk size.`);
      }
      
      // For non-rate-limit errors or final attempt, throw immediately
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
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

  // Chunk the text if needed (use 5000 tokens max for extra safety, OpenAI limit is 8192)
  // Further split any chunk that's still too large
  let chunks = chunkText(fullText, 5000, 200);
  
  // Validate and further split chunks that might still be too large
  // Some text can have very high token density (e.g., code, URLs)
  const validatedChunks: string[] = [];
  for (const chunk of chunks) {
    // If chunk is very large (>16k chars), split it further (assuming worst case 1 char = 1 token)
    if (chunk.length > 16000) {
      const subChunks = chunkText(chunk, 4000, 100);
      validatedChunks.push(...subChunks);
    } else {
      validatedChunks.push(chunk);
    }
  }
  chunks = validatedChunks;

  try {
    const openai = createOpenAIClient(openaiApiKey);
    
    // Generate embeddings for all chunks with rate limiting
    // Process in smaller batches to avoid rate limits
    const batchSize = 5; // Reduced batch size to avoid rate limits
    const embeddings = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        const response = await retryWithBackoff(() =>
          openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunk,
          })
        );

        return {
          email_id: emailId,
          chunk_text: chunk,
          chunk_index: chunkIndex,
          embedding: response.data[0].embedding,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults);
      
      // Longer delay between batches to avoid rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

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

  // Chunk the text if needed (use 5000 tokens max for extra safety, OpenAI limit is 8192)
  // Further split any chunk that's still too large
  let chunks = chunkText(text, 5000, 200);
  
  // Validate and further split chunks that might still be too large
  // Some text can have very high token density (e.g., code, URLs)
  const validatedChunks: string[] = [];
  for (const chunk of chunks) {
    // If chunk is very large (>16k chars), split it further (assuming worst case 1 char = 1 token)
    if (chunk.length > 16000) {
      const subChunks = chunkText(chunk, 4000, 100);
      validatedChunks.push(...subChunks);
    } else {
      validatedChunks.push(chunk);
    }
  }
  chunks = validatedChunks;

  try {
    const openai = createOpenAIClient(openaiApiKey);
    
    // Generate embeddings for all chunks with rate limiting
    // Process in smaller batches to avoid rate limits
    const batchSize = 5; // Reduced batch size to avoid rate limits
    const embeddings = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (chunk, batchIndex) => {
        const chunkIndex = i + batchIndex;
        const response = await retryWithBackoff(() =>
          openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunk,
          })
        );

        return {
          attachment_id: attachmentId,
          chunk_text: chunk,
          chunk_index: chunkIndex,
          embedding: response.data[0].embedding,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      embeddings.push(...batchResults);
      
      // Longer delay between batches to avoid rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

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
    const response = await retryWithBackoff(() =>
      openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      })
    );

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

