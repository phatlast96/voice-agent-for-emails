import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';

interface EmailDetailsRequest {
  apiKey: string;
  grantId: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const emailId = params.id;
    const body: EmailDetailsRequest = await request.json();
    const { apiKey, grantId } = body;

    if (!apiKey || !grantId || !emailId) {
      return NextResponse.json(
        { error: 'API Key, Grant ID, and Email ID are required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // First, try to fetch from Supabase cache
    const { data: cachedEmail, error: cacheError } = await supabase
      .from('emails')
      .select(`
        id,
        subject,
        from_name,
        from_email,
        snippet,
        body,
        date,
        email_recipients (
          type,
          name,
          email
        ),
        attachments (
          id,
          filename,
          content_type,
          size,
          is_inline,
          content_id,
          storage_path
        )
      `)
      .eq('id', emailId)
      .eq('grant_id', grantId)
      .single();

    if (cachedEmail && !cacheError) {
      // Check if embeddings exist
      const { data: embeddingsData } = await supabase
        .from('email_embeddings')
        .select('id')
        .eq('email_id', emailId)
        .limit(1);

      const hasEmbeddings = embeddingsData && embeddingsData.length > 0;

      // Transform cached email to our format
      const email = {
        id: cachedEmail.id,
        subject: cachedEmail.subject,
        from: {
          name: cachedEmail.from_name,
          email: cachedEmail.from_email,
        },
        to: (cachedEmail.email_recipients || [])
          .filter((r: any) => r.type === 'to')
          .map((r: any) => ({
            name: r.name || 'Unknown',
            email: r.email,
          })),
        date: new Date(cachedEmail.date),
        snippet: cachedEmail.snippet,
        body: cachedEmail.body || '',
        hasAttachments: (cachedEmail.attachments || []).length > 0,
        hasEmbeddings: hasEmbeddings,
        attachments: (cachedEmail.attachments || []).map((a: any) => ({
          id: a.id,
          filename: a.filename,
          content_type: a.content_type,
          size: a.size,
          is_inline: a.is_inline || false,
          content_id: a.content_id,
          storage_path: a.storage_path,
        })),
      };

      return NextResponse.json({ email, cached: true });
    }

    // Fallback to Nylas API if not found in cache
    console.log(`Email ${emailId} not found in cache, fetching from Nylas API`);

    const nylasApiUrl = `https://api.us.nylas.com/v3/grants/${grantId}/messages/${emailId}`;
    
    const response = await fetch(nylasApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Nylas API error:', errorText);
      return NextResponse.json(
        { error: `Nylas API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const message = await response.json();

    // Transform attachments from Nylas format
    const attachments = (message.attachments || []).map((attachment: any) => ({
      id: attachment.id,
      filename: attachment.filename || 'unknown',
      content_type: attachment.content_type || 'application/octet-stream',
      size: attachment.size || 0,
      is_inline: attachment.is_inline || false,
      content_id: attachment.content_id,
    }));

    // Transform Nylas message to our Email format
    const email = {
      id: message.id,
      subject: message.subject || '(No subject)',
      from: {
        name: message.from?.[0]?.name || message.from?.[0]?.email || 'Unknown',
        email: message.from?.[0]?.email || 'unknown@example.com',
      },
      to: (message.to || []).map((recipient: any) => ({
        name: recipient.name || recipient.email || 'Unknown',
        email: recipient.email || 'unknown@example.com',
      })),
      date: new Date(message.date * 1000), // Nylas uses Unix timestamp
      snippet: message.snippet || '',
      body: message.body || '',
      hasAttachments: attachments.length > 0,
      hasEmbeddings: false, // Will be true once embeddings are generated
      attachments: attachments,
    };

    // Optionally save to Supabase cache for future requests (async, don't wait)
    // This would be similar to the crawl route logic

    return NextResponse.json({ email, cached: false });
  } catch (error) {
    console.error('Error fetching email details:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch email details' },
      { status: 500 }
    );
  }
}
