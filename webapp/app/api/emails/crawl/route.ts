import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';
import { generateEmailEmbeddings, generateAttachmentEmbeddings } from '@/lib/services/embeddings';
import { extractTextFromAttachment } from '@/lib/services/attachment-extractor';

interface CrawlRequest {
  apiKey: string;
  grantId: string;
  openaiApiKey?: string;
  limit?: number;
}

interface NylasAttachment {
  id: string;
  filename?: string;
  content_type?: string;
  size?: number;
  is_inline?: boolean;
  content_id?: string;
}

interface NylasRecipient {
  name?: string;
  email: string;
}

interface NylasMessage {
  id: string;
  subject?: string;
  from?: NylasRecipient[];
  to?: NylasRecipient[];
  cc?: NylasRecipient[];
  bcc?: NylasRecipient[];
  snippet?: string;
  body?: string;
  date?: number | string;
  attachments?: NylasAttachment[];
}

export async function POST(request: NextRequest) {
  const supabase = createSupabaseClient();
  let crawlJobId: string | null = null;

  try {
    const body: CrawlRequest = await request.json();
    const { apiKey, grantId, openaiApiKey, limit = 200 } = body;

    if (!apiKey || !grantId) {
      return NextResponse.json(
        { error: 'API Key and Grant ID are required' },
        { status: 400 }
      );
    }

    // Create crawl job record
    const { data: crawlJob, error: crawlJobError } = await supabase
      .from('crawl_jobs')
      .insert({
        grant_id: grantId,
        status: 'running',
        emails_crawled: 0,
      })
      .select()
      .single();

    if (crawlJobError || !crawlJob) {
      console.error('Error creating crawl job:', crawlJobError);
      return NextResponse.json(
        { error: 'Failed to create crawl job' },
        { status: 500 }
      );
    }

    crawlJobId = crawlJob.id;

    // Fetch messages from Nylas API v3
    const url = new URL(`https://api.us.nylas.com/v3/grants/${grantId}/messages`);
    url.searchParams.append('limit', limit.toString());
    
    console.log('Fetching from Nylas API:', url.toString());
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Nylas API error:', errorText);
      let errorMessage = `Nylas API error: ${response.status} ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Use default error message if parsing fails
      }

      // Update crawl job with error
      if (crawlJobId) {
        await supabase
          .from('crawl_jobs')
          .update({
            status: 'error',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', crawlJobId);
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    const messages: NylasMessage[] = data.data || [];

    // Utility function to process items in parallel with concurrency limit
    async function processInParallel<T, R>(
      items: T[],
      processor: (item: T) => Promise<R>,
      concurrency: number = 10
    ): Promise<R[]> {
      const results: R[] = [];
      
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map(processor)
        );
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          }
        }
      }
      
      return results;
    }

    // Process all emails in parallel batches
    const embeddingPromises: Promise<void>[] = [];

    // Process each email
    const emailResults = await processInParallel(
      messages,
      async (message: NylasMessage) => {
        try {
          // Handle date
          let date: Date;
          if (typeof message.date === 'number') {
            date = new Date(message.date * 1000);
          } else if (typeof message.date === 'string') {
            date = new Date(message.date);
          } else {
            date = new Date();
          }

          // Prepare email data
          const emailData = {
            id: message.id,
            grant_id: grantId,
            subject: message.subject || '(No subject)',
            from_name: message.from?.[0]?.name || message.from?.[0]?.email || 'Unknown',
            from_email: message.from?.[0]?.email || 'unknown@example.com',
            snippet: message.snippet || '',
            body: message.body || null,
            date: date.toISOString(),
          };

          // Upsert email (handle duplicates)
          const { error: emailError } = await supabase
            .from('emails')
            .upsert(emailData, { onConflict: 'id' });

          if (emailError) {
            console.error(`Error saving email ${message.id}:`, emailError);
            return null;
          }

          // Save recipients
          const recipients = [];
          
          // Handle 'to' recipients
          if (message.to && Array.isArray(message.to)) {
            for (const recipient of message.to) {
              recipients.push({
                email_id: message.id,
                type: 'to',
                name: recipient.name || null,
                email: recipient.email || 'unknown@example.com',
              });
            }
          }

          // Handle 'cc' recipients
          if (message.cc && Array.isArray(message.cc)) {
            for (const recipient of message.cc) {
              recipients.push({
                email_id: message.id,
                type: 'cc',
                name: recipient.name || null,
                email: recipient.email || 'unknown@example.com',
              });
            }
          }

          // Handle 'bcc' recipients
          if (message.bcc && Array.isArray(message.bcc)) {
            for (const recipient of message.bcc) {
              recipients.push({
                email_id: message.id,
                type: 'bcc',
                name: recipient.name || null,
                email: recipient.email || 'unknown@example.com',
              });
            }
          }

          // Delete existing recipients and insert new ones
          if (recipients.length > 0) {
            await supabase.from('email_recipients').delete().eq('email_id', message.id);
            const { error: recipientsError } = await supabase
              .from('email_recipients')
              .insert(recipients);

            if (recipientsError) {
              console.error(`Error saving recipients for email ${message.id}:`, recipientsError);
            }
          }

          // Process attachments in parallel
          const attachments = message.attachments || [];
          const savedAttachments = await processInParallel(
            attachments,
            async (attachment: NylasAttachment) => {
              try {
                // Download attachment from Nylas
                const attachmentUrl = `https://api.us.nylas.com/v3/grants/${grantId}/attachments/${attachment.id}/download?message_id=${message.id}`;
                const attachmentResponse = await fetch(attachmentUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                  },
                });

                if (!attachmentResponse.ok) {
                  console.error(`Failed to download attachment ${attachment.id}`);
                  return null;
                }

                const attachmentBuffer = await attachmentResponse.arrayBuffer();
                const originalFilename = attachment.filename || 'unknown';
                
                // Sanitize filename for storage (remove special chars, limit length, handle Unicode)
                const sanitizeFilename = (name: string): string => {
                  // Extract extension if present
                  const lastDot = name.lastIndexOf('.');
                  const baseName = lastDot > 0 ? name.substring(0, lastDot) : name;
                  const extension = lastDot > 0 ? name.substring(lastDot) : '';
                  
                  // Remove or replace problematic characters
                  // Replace Unicode characters > 255 with underscore, keep ASCII safe chars
                  let sanitized = baseName
                    .replace(/[^\x00-\x7F]/g, '_') // Replace non-ASCII with underscore
                    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Remove invalid filesystem chars
                    .replace(/\s+/g, '_') // Replace spaces with underscores
                    .replace(/_+/g, '_') // Collapse multiple underscores
                    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
                    .substring(0, 200); // Limit length
                  
                  // Ensure we have something
                  if (!sanitized) {
                    sanitized = 'file';
                  }
                  
                  return sanitized + extension;
                };
                
                const filename = sanitizeFilename(originalFilename);
                const storagePath = `${grantId}/${message.id}/${attachment.id}/${filename}`;

                // Upload to Supabase storage with retry logic for transient errors
                let uploadError: any = null;
                const maxRetries = 3;
                for (let retry = 0; retry < maxRetries; retry++) {
                  const result = await supabase.storage
                    .from('email-attachments')
                    .upload(storagePath, attachmentBuffer, {
                      contentType: attachment.content_type || 'application/octet-stream',
                      upsert: true,
                    });
                  
                  uploadError = result.error;
                  
                  // Retry on 500 errors (server errors) or 503 (service unavailable)
                  if (uploadError && (uploadError.statusCode === '500' || uploadError.statusCode === '503') && retry < maxRetries - 1) {
                    const delay = Math.pow(2, retry) * 1000; // Exponential backoff: 1s, 2s, 4s
                    console.log(`Storage upload failed, retrying in ${delay}ms (attempt ${retry + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                  }
                  
                  // Success or non-retryable error
                  break;
                }

                if (uploadError) {
                  // Log detailed error info but don't fail the entire process
                  console.error(`Error uploading attachment ${attachment.id} after ${maxRetries} attempts:`, {
                    error: uploadError,
                    statusCode: uploadError.statusCode,
                    message: uploadError.message,
                    filename: originalFilename,
                    storagePath: storagePath,
                  });
                  // Continue processing - attachment metadata will still be saved but without storage
                  // The storage_path will be set, but the file won't be available for download
                }

                // Save attachment metadata (use original filename for display, sanitized for storage path)
                const attachmentData = {
                  id: attachment.id,
                  email_id: message.id,
                  filename: originalFilename, // Keep original for user display
                  content_type: attachment.content_type || 'application/octet-stream',
                  size: attachment.size || 0,
                  is_inline: attachment.is_inline || false,
                  content_id: attachment.content_id || null,
                  storage_path: storagePath, // Uses sanitized filename in path
                };

                const { error: attachmentError } = await supabase
                  .from('attachments')
                  .upsert(attachmentData, { onConflict: 'id' });

                if (attachmentError) {
                  console.error(`Error saving attachment metadata ${attachment.id}:`, attachmentError);
                  return null;
                }

                const savedAttachment = {
                  id: attachment.id,
                  filename: originalFilename, // Keep original for display, but use sanitized for storage
                  content_type: attachment.content_type || 'application/octet-stream',
                  size: attachment.size || 0,
                  is_inline: attachment.is_inline || false,
                  content_id: attachment.content_id,
                };

                // Extract text and generate embeddings for attachment (async)
                if (openaiApiKey) {
                  const embeddingPromise = extractTextFromAttachment(
                    attachmentBuffer,
                    attachment.content_type || 'application/octet-stream',
                    filename
                  )
                    .then((extracted) => {
                      if (extracted.success && extracted.text) {
                        return generateAttachmentEmbeddings(attachment.id, extracted.text, openaiApiKey);
                      }
                    })
                    .catch((err) => {
                      console.error(`Error processing embeddings for attachment ${attachment.id}:`, err);
                    });
                  
                  embeddingPromises.push(embeddingPromise);
                }

                return savedAttachment;
              } catch (attachmentError) {
                console.error(`Error processing attachment ${attachment.id}:`, attachmentError);
                return null;
              }
            },
            5 // Process 5 attachments in parallel per email
          );

          const validAttachments = savedAttachments.filter((a): a is NonNullable<typeof a> => a !== null);

          // Transform for response
          const emailResponse = {
            id: message.id,
            subject: emailData.subject,
            from: {
              name: emailData.from_name,
              email: emailData.from_email,
            },
            to: recipients
              .filter((r) => r.type === 'to')
              .map((r) => ({ name: r.name || 'Unknown', email: r.email })),
            date: date,
            snippet: emailData.snippet,
            body: emailData.body || '',
            hasAttachments: validAttachments.length > 0,
            hasEmbeddings: false, // Will be true once embeddings are generated
            attachments: validAttachments,
          };

          // Generate embeddings for email content (async)
          if (openaiApiKey) {
            const emailEmbeddingPromise = generateEmailEmbeddings(
              message.id,
              emailData.subject,
              emailData.body || '',
              openaiApiKey
            ).catch((err) => {
              console.error(`Error generating embeddings for email ${message.id}:`, err);
            });
            
            embeddingPromises.push(emailEmbeddingPromise);
          }

          return emailResponse;
        } catch (emailError) {
          console.error(`Error processing email ${message.id}:`, emailError);
          return null;
        }
      },
      10 // Process 10 emails in parallel
    );

    // Filter out null results and get valid emails
    const emails = emailResults.filter((e): e is NonNullable<typeof e> => e !== null);
    const savedCount = emails.length;

    // Wait for all embeddings to complete (but don't block the response)
    // This ensures embeddings are generated even if the response is sent early
    Promise.allSettled(embeddingPromises).then((results) => {
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      console.log(`Embedding generation completed: ${successful} successful, ${failed} failed`);
    });

    // Sort emails by date (newest first)
    emails.sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

    // Update crawl job as completed
    if (crawlJobId) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'completed',
          emails_crawled: savedCount,
          completed_at: new Date().toISOString(),
        })
        .eq('id', crawlJobId);
    }

    return NextResponse.json({ emails, savedCount });
  } catch (error) {
    console.error('Error fetching emails:', error);

    // Update crawl job with error
    if (crawlJobId) {
      await supabase
        .from('crawl_jobs')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', crawlJobId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}
