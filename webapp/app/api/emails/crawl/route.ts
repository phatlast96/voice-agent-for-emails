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
    const messages = data.data || [];

    // Transform and save emails to Supabase
    const emails = [];
    let savedCount = 0;

    for (const message of messages) {
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
          continue;
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

        // Process attachments
        const attachments = message.attachments || [];
        const savedAttachments = [];

        for (const attachment of attachments) {
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
              continue;
            }

            const attachmentBuffer = await attachmentResponse.arrayBuffer();
            const filename = attachment.filename || 'unknown';
            const storagePath = `${grantId}/${message.id}/${attachment.id}/${filename}`;

            // Upload to Supabase storage
            const { error: uploadError } = await supabase.storage
              .from('email-attachments')
              .upload(storagePath, attachmentBuffer, {
                contentType: attachment.content_type || 'application/octet-stream',
                upsert: true,
              });

            if (uploadError) {
              console.error(`Error uploading attachment ${attachment.id}:`, uploadError);
              continue;
            }

            // Save attachment metadata
            const attachmentData = {
              id: attachment.id,
              email_id: message.id,
              filename: filename,
              content_type: attachment.content_type || 'application/octet-stream',
              size: attachment.size || 0,
              is_inline: attachment.is_inline || false,
              content_id: attachment.content_id || null,
              storage_path: storagePath,
            };

            const { error: attachmentError } = await supabase
              .from('attachments')
              .upsert(attachmentData, { onConflict: 'id' });

            if (attachmentError) {
              console.error(`Error saving attachment metadata ${attachment.id}:`, attachmentError);
              continue;
            }

            savedAttachments.push({
              id: attachment.id,
              filename: filename,
              content_type: attachment.content_type || 'application/octet-stream',
              size: attachment.size || 0,
              is_inline: attachment.is_inline || false,
              content_id: attachment.content_id,
            });

            // Extract text and generate embeddings for attachment (async, don't wait)
            if (openaiApiKey) {
              extractTextFromAttachment(
                attachmentBuffer,
                attachment.content_type || 'application/octet-stream',
                filename
              )
                .then((extracted) => {
                  if (extracted.success && extracted.text) {
                    generateAttachmentEmbeddings(attachment.id, extracted.text, openaiApiKey).catch((err) => {
                      console.error(`Error generating embeddings for attachment ${attachment.id}:`, err);
                    });
                  }
                })
                .catch((err) => {
                  console.error(`Error extracting text from attachment ${attachment.id}:`, err);
                });
            }

          } catch (attachmentError) {
            console.error(`Error processing attachment ${attachment.id}:`, attachmentError);
          }
        }

        // Transform for response
        emails.push({
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
          hasAttachments: savedAttachments.length > 0,
          hasEmbeddings: false, // Will be true once embeddings are generated
          attachments: savedAttachments,
        });

        // Generate embeddings for email content (async, don't wait)
        if (openaiApiKey) {
          generateEmailEmbeddings(message.id, emailData.subject, emailData.body || '', openaiApiKey).catch(
            (err) => {
              console.error(`Error generating embeddings for email ${message.id}:`, err);
            }
          );
        }

        savedCount++;
      } catch (emailError) {
        console.error(`Error processing email ${message.id}:`, emailError);
      }
    }

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
