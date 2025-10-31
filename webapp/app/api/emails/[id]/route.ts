import { NextRequest, NextResponse } from 'next/server';

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

    // Fetch message details from Nylas API
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
      hasAttachments: (message.files || []).length > 0,
    };

    return NextResponse.json({ email });
  } catch (error) {
    console.error('Error fetching email details:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch email details' },
      { status: 500 }
    );
  }
}

