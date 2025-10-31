import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';
import { generateQueryEmbedding } from '@/lib/services/embeddings';

interface SearchRequest {
  query: string;
  grantId?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  senderEmail?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchRequest = await request.json();
    const { query, grantId, limit = 10, dateFrom, dateTo, senderEmail } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Perform vector similarity search for email embeddings
    const { data: emailMatches, error: emailError } = await supabase
      .rpc('match_email_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit * 2,
      })
      .select('email_id, chunk_text, chunk_index');

    if (emailError) {
      console.error('Error searching email embeddings:', emailError);
      // Fallback: try direct query if RPC doesn't exist
      // For now, return error - we'll need to create the RPC function in migration
      return NextResponse.json(
        { error: 'Search functionality requires database function. Please run migrations.' },
        { status: 500 }
      );
    }

    // Perform vector similarity search for attachment embeddings
    const { data: attachmentMatches, error: attachmentError } = await supabase
      .rpc('match_attachment_embeddings', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit * 2,
      })
      .select('attachment_id, chunk_text, chunk_index');

    // Get unique email IDs from matches
    const emailIds = [...new Set((emailMatches || []).map((m: any) => m.email_id))];
    const attachmentIds = [...new Set((attachmentMatches || []).map((m: any) => m.attachment_id))];

    // Fetch full email details
    let emailsQuery = supabase
      .from('emails')
      .select(`
        id,
        subject,
        from_name,
        from_email,
        snippet,
        body,
        date,
        created_at,
        email_recipients (
          type,
          name,
          email
        ),
        attachments (
          id,
          filename,
          content_type,
          size
        )
      `)
      .in('id', emailIds);

    // Apply filters
    if (grantId) {
      emailsQuery = emailsQuery.eq('grant_id', grantId);
    }

    if (dateFrom) {
      emailsQuery = emailsQuery.gte('date', dateFrom);
    }

    if (dateTo) {
      emailsQuery = emailsQuery.lte('date', dateTo);
    }

    if (senderEmail) {
      emailsQuery = emailsQuery.eq('from_email', senderEmail);
    }

    const { data: emails, error: emailsError } = await emailsQuery.limit(limit);

    if (emailsError) {
      console.error('Error fetching emails:', emailsError);
      return NextResponse.json(
        { error: 'Failed to fetch email details' },
        { status: 500 }
      );
    }

    // Fetch attachment details for attachment matches
    let attachmentsQuery = supabase
      .from('attachments')
      .select(`
        id,
        email_id,
        filename,
        content_type,
        size,
        emails (
          id,
          subject,
          from_name,
          from_email,
          date
        )
      `)
      .in('id', attachmentIds);

    const { data: attachments, error: attachmentsError } = await attachmentsQuery;

    // Transform results
    const results = {
      emails: (emails || []).map((email: any) => ({
        id: email.id,
        subject: email.subject,
        from: {
          name: email.from_name,
          email: email.from_email,
        },
        to: (email.email_recipients || [])
          .filter((r: any) => r.type === 'to')
          .map((r: any) => ({ name: r.name || 'Unknown', email: r.email })),
        date: email.date,
        snippet: email.snippet,
        body: email.body,
        hasAttachments: (email.attachments || []).length > 0,
        attachments: (email.attachments || []).map((a: any) => ({
          id: a.id,
          filename: a.filename,
          content_type: a.content_type,
          size: a.size,
        })),
        // Add matching chunk text for context
        matchingChunks: (emailMatches || [])
          .filter((m: any) => m.email_id === email.id)
          .map((m: any) => m.chunk_text)
          .slice(0, 2), // Show top 2 matching chunks
      })),
      attachments: (attachments || []).map((attachment: any) => ({
        id: attachment.id,
        emailId: attachment.email_id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        size: attachment.size,
        email: attachment.emails
          ? {
              id: attachment.emails.id,
              subject: attachment.emails.subject,
              from: {
                name: attachment.emails.from_name,
                email: attachment.emails.from_email,
              },
              date: attachment.emails.date,
            }
          : null,
        matchingChunks: (attachmentMatches || [])
          .filter((m: any) => m.attachment_id === attachment.id)
          .map((m: any) => m.chunk_text)
          .slice(0, 2),
      })),
    };

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error performing search:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform search' },
      { status: 500 }
    );
  }
}

