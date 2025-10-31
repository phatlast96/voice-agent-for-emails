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
    // Note: The base URL might vary by region (api.us.nylas.com, api.eu.nylas.com, etc.)
    const url = new URL(`https://api.us.nylas.com/v3/grants/${grantId}/messages`);
    url.searchParams.append('limit', limit.toString());
    // Note: Nylas API v3 doesn't support order_by and order parameters
    // We'll sort the results client-side after fetching
    
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
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform Nylas messages to our Email format
    const emails = (data.data || []).map((message: any) => {
      // Handle date - Nylas can return Unix timestamp (seconds) or ISO string
      let date: Date;
      if (typeof message.date === 'number') {
        date = new Date(message.date * 1000); // Convert seconds to milliseconds
      } else if (typeof message.date === 'string') {
        date = new Date(message.date);
      } else {
        date = new Date(); // Fallback to current date
      }

      return {
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
        date: date,
        snippet: message.snippet || '',
        body: message.body || '',
        hasAttachments: (message.files || []).length > 0,
      };
    });

    // Sort emails by date (newest first) since Nylas API doesn't support ordering
    emails.sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

