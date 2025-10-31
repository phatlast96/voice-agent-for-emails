import { NextRequest, NextResponse } from 'next/server';

interface AttachmentDownloadRequest {
  apiKey: string;
  grantId: string;
  download?: boolean; // If true, download the file; if false, return metadata
}

/**
 * POST endpoint to download attachment content or get metadata from Nylas API
 * Documentation: https://developer.nylas.com/docs/v3/email/attachments/
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const params = await context.params;
    const messageId = params.id;
    const attachmentId = params.attachmentId;
    const body: AttachmentDownloadRequest = await request.json();
    const { apiKey, grantId, download = false } = body;

    if (!apiKey || !grantId || !messageId || !attachmentId) {
      return NextResponse.json(
        { error: 'API Key, Grant ID, Message ID, and Attachment ID are required' },
        { status: 400 }
      );
    }

    // Fetch attachment from Nylas API
    // Using query param for message_id as per Nylas docs
    // For metadata: GET /v3/grants/{grant_id}/attachments/{attachment_id}?message_id={message_id}
    // For download: GET /v3/grants/{grant_id}/attachments/{attachment_id}/download?message_id={message_id}
    const baseUrl = `https://api.us.nylas.com/v3/grants/${grantId}/attachments/${attachmentId}`;
    const queryParam = `?message_id=${messageId}`;
    const nylasApiUrl = download 
      ? `${baseUrl}/download${queryParam}`
      : `${baseUrl}${queryParam}`;

    const response = await fetch(nylasApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': download ? '*/*' : 'application/json',
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

    if (download) {
      // Return the file as download
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('content-disposition') || '';
      
      // Get filename from content-disposition header if available
      let filename = 'attachment';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }

      const arrayBuffer = await response.arrayBuffer();

      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': arrayBuffer.byteLength.toString(),
        },
      });
    } else {
      // Return attachment metadata
      const attachmentData = await response.json();

      return NextResponse.json({
        attachment: {
          id: attachmentData.data?.id || attachmentId,
          filename: attachmentData.data?.filename || 'unknown',
          content_type: attachmentData.data?.content_type || 'application/octet-stream',
          size: attachmentData.data?.size || 0,
          is_inline: attachmentData.data?.is_inline || false,
          content_id: attachmentData.data?.content_id,
        },
      });
    }
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch attachment' },
      { status: 500 }
    );
  }
}

