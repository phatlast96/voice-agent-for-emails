import { NextRequest, NextResponse } from 'next/server';

interface CrawlRequest {
  apiKey: string;
  grantId: string;
  limit?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: CrawlRequest = await request.json();
    const { apiKey, grantId, limit = 50 } = body;

    if (!apiKey || !grantId) {
      return NextResponse.json(
        { error: 'API Key and Grant ID are required' },
        { status: 400 }
      );
    }

    // Fetch messages from Nylas API v3
    // Documentation: https://developer.nylas.com/docs/v3/email/messages/
    const url = new URL(`https://api.us.nylas.com/v3/grants/${grantId}/messages`);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('order_by', 'date');
    url.searchParams.append('order', 'desc');
    
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
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Use default error message if parsing fails
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Nylas messages to our Email format
    const emails = (data.data || []).map((message: any) => ({
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
      date: new Date(message.date * 1000), // Nylas uses Unix timestamp in seconds
      snippet: message.snippet || '',
      body: message.body || '',
      hasAttachments: (message.files || []).length > 0,
    }));

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

