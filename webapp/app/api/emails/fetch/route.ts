import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';

interface FetchEmailsRequest {
  grantId: string;
  limit?: number;
  offset?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: FetchEmailsRequest = await request.json();
    const { grantId, limit = 50, offset = 0 } = body;

    if (!grantId) {
      return NextResponse.json(
        { error: 'Grant ID is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // Fetch emails from Supabase
    const { data: emails, error } = await supabase
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
          size,
          is_inline,
          content_id
        )
      `)
      .eq('grant_id', grantId)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching emails from Supabase:', error);
      return NextResponse.json(
        { error: 'Failed to fetch emails from database' },
        { status: 500 }
      );
    }

    // Check which emails have embeddings
    const emailIds = (emails || []).map((e: any) => e.id);
    const { data: embeddingsData } = await supabase
      .from('email_embeddings')
      .select('email_id')
      .in('email_id', emailIds);

    const emailsWithEmbeddings = new Set(
      (embeddingsData || []).map((e: any) => e.email_id)
    );

    // Transform to our Email format
    const transformedEmails = (emails || []).map((email: any) => ({
      id: email.id,
      subject: email.subject,
      from: {
        name: email.from_name,
        email: email.from_email,
      },
      to: (email.email_recipients || [])
        .filter((r: any) => r.type === 'to')
        .map((r: any) => ({
          name: r.name || 'Unknown',
          email: r.email,
        })),
      date: new Date(email.date),
      snippet: email.snippet,
      body: email.body || '',
      hasAttachments: (email.attachments || []).length > 0,
      hasEmbeddings: emailsWithEmbeddings.has(email.id),
      attachments: (email.attachments || []).map((a: any) => ({
        id: a.id,
        filename: a.filename,
        content_type: a.content_type,
        size: a.size,
        is_inline: a.is_inline || false,
        content_id: a.content_id,
      })),
    }));

    return NextResponse.json({ emails: transformedEmails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

