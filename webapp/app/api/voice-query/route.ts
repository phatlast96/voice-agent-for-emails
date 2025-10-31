import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';
import { generateQueryEmbedding } from '@/lib/services/embeddings';
import OpenAI from 'openai';

interface VoiceQueryRequest {
  transcript?: string;
  audio?: string; // base64 encoded audio
  audioFormat?: string; // e.g., 'webm', 'wav'
  openaiApiKey: string;
  grantId: string;
  matchThreshold?: number;
  matchCount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: VoiceQueryRequest = await request.json();
    const {
      transcript: providedTranscript,
      audio,
      audioFormat,
      openaiApiKey,
      grantId,
      matchThreshold = 0.5, // Lower threshold for better recall
      matchCount = 15, // Increase match count
    } = body;

    if (!openaiApiKey || !grantId) {
      return NextResponse.json(
        { error: 'OpenAI API Key and Grant ID are required' },
        { status: 400 }
      );
    }

    // Step 1: Convert audio to text using Whisper API if audio is provided
    let transcript = providedTranscript;
    
    if (audio && !transcript) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        
        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audio, 'base64');
        
        // Create a File object from the buffer
        // The OpenAI SDK accepts File objects in Node.js environments
        const audioFile = new File([audioBuffer], `audio.${audioFormat || 'webm'}`, {
          type: `audio/${audioFormat || 'webm'}`,
        });

        const whisperResponse = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          language: 'en',
        });

        transcript = whisperResponse.text;
      } catch (error: any) {
        console.error('Whisper API error:', error);
        // Fallback: use direct API call with form-data for better compatibility
        try {
          const FormData = (await import('form-data')).default;
          const form = new FormData();
          form.append('file', Buffer.from(audio, 'base64'), {
            filename: `audio.${audioFormat || 'webm'}`,
            contentType: `audio/${audioFormat || 'webm'}`,
          });
          form.append('model', 'whisper-1');
          form.append('language', 'en');

          const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              ...form.getHeaders(),
            },
            body: form as any,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Whisper API error: ${response.statusText} - ${errorText}`);
          }

          const result = await response.json();
          transcript = result.text;
        } catch (fallbackError: any) {
          console.error('Whisper fallback error:', fallbackError);
          return NextResponse.json(
            { error: `Failed to transcribe audio: ${fallbackError.message || 'Unknown error'}` },
            { status: 500 }
          );
        }
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: 'No transcript provided and audio transcription failed' },
        { status: 400 }
      );
    }

    // Step 2: Generate embedding for the query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateQueryEmbedding(transcript, openaiApiKey);
    } catch (error: any) {
      console.error('Error generating query embedding:', error);
      return NextResponse.json(
        { error: `Failed to generate query embedding: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Step 3: Search email embeddings using cosine similarity
    const supabase = createSupabaseClient();
    
    const { data: emailMatches, error: emailError } = await supabase.rpc('match_email_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (emailError) {
      console.error('Error searching email embeddings:', emailError);
    }

    // Step 4: Search attachment embeddings using cosine similarity
    const { data: attachmentMatches, error: attachmentError } = await supabase.rpc(
      'match_attachment_embeddings',
      {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
      }
    );

    if (attachmentError) {
      console.error('Error searching attachment embeddings:', attachmentError);
    }

    // Step 5: Fetch full email and attachment details for matched results
    const emailMatchesData = emailMatches || [];
    const attachmentMatchesData = attachmentMatches || [];

    // Check if query is about recent/last emails (time-based queries)
    const timeBasedKeywords = ['last', 'recent', 'latest', 'newest', 'most recent', 'latest email', 'last email', 'recent email'];
    const isTimeBasedQuery = timeBasedKeywords.some(keyword => 
      transcript.toLowerCase().includes(keyword.toLowerCase())
    );

    // Get unique email IDs and attachment IDs
    const emailIds = [...new Set(emailMatchesData.map((m: any) => m.email_id))];
    const attachmentIds = [...new Set(attachmentMatchesData.map((m: any) => m.attachment_id))];

    // Fetch email details
    let emails: any[] = [];
    
    // If no matches from semantic search OR time-based query, fetch recent emails directly
    if (emailIds.length === 0 || (isTimeBasedQuery && emailIds.length < 3)) {
      const { data: recentEmailsData } = await supabase
        .from('emails')
        .select('id, subject, from_name, from_email, snippet, body, date')
        .eq('grant_id', grantId)
        .order('date', { ascending: false })
        .limit(isTimeBasedQuery ? 5 : 3);

      if (recentEmailsData && recentEmailsData.length > 0) {
        emails = recentEmailsData.map((email: any) => ({
          ...email,
          matchingChunks: [],
          maxSimilarity: isTimeBasedQuery ? 0.9 : 0.8, // High similarity for time-based queries
        }));
      }
    } else if (emailIds.length > 0) {
      const { data: emailsData } = await supabase
        .from('emails')
        .select('id, subject, from_name, from_email, snippet, body, date')
        .in('id', emailIds)
        .eq('grant_id', grantId);

      // Map emails with their matching chunks
      emails = (emailsData || []).map((email: any) => {
        const matchingChunks = emailMatchesData
          .filter((m: any) => m.email_id === email.id)
          .sort((a: any, b: any) => b.similarity - a.similarity)
          .slice(0, 3); // Top 3 chunks per email

        return {
          ...email,
          matchingChunks,
          maxSimilarity: matchingChunks[0]?.similarity || 0,
        };
      });

      // Sort by max similarity, then by date (most recent first) if similarity is similar
      emails.sort((a, b) => {
        if (Math.abs(a.maxSimilarity - b.maxSimilarity) < 0.1) {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return b.maxSimilarity - a.maxSimilarity;
      });
    }

    // Fetch attachment details
    let attachments: any[] = [];
    if (attachmentIds.length > 0) {
      const { data: attachmentsData } = await supabase
        .from('attachments')
        .select('id, email_id, filename, content_type, size')
        .in('id', attachmentIds);

      // Map attachments with their matching chunks
      attachments = (attachmentsData || []).map((attachment: any) => {
        const matchingChunks = attachmentMatchesData
          .filter((m: any) => m.attachment_id === attachment.id)
          .sort((a: any, b: any) => b.similarity - a.similarity)
          .slice(0, 3); // Top 3 chunks per attachment

        return {
          ...attachment,
          matchingChunks,
          maxSimilarity: matchingChunks[0]?.similarity || 0,
        };
      });

      // Sort by max similarity
      attachments.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
    }

    // Step 6: Build context for OpenAI
    const contextParts: string[] = [];

    if (emails.length > 0) {
      contextParts.push('=== RELEVANT EMAILS ===');
      emails.slice(0, 5).forEach((email, idx) => {
        contextParts.push(
          `\nEmail ${idx + 1} (Relevance: ${(email.maxSimilarity * 100).toFixed(1)}%):`
        );
        contextParts.push(`From: ${email.from_name} <${email.from_email}>`);
        contextParts.push(`Subject: ${email.subject}`);
        contextParts.push(`Date: ${new Date(email.date).toLocaleDateString()}`);
        contextParts.push(`Snippet: ${email.snippet}`);
        
        // Add most relevant chunks
        if (email.matchingChunks && email.matchingChunks.length > 0) {
          contextParts.push('\nMost relevant content:');
          email.matchingChunks.forEach((chunk: any, chunkIdx: number) => {
            contextParts.push(`\n[Chunk ${chunkIdx + 1}]: ${chunk.chunk_text.substring(0, 500)}...`);
          });
        }
        
        if (email.body) {
          contextParts.push(`\nFull body preview: ${email.body.substring(0, 300)}...`);
        }
        contextParts.push('\n');
      });
    }

    if (attachments.length > 0) {
      contextParts.push('\n=== RELEVANT ATTACHMENTS ===');
      attachments.slice(0, 3).forEach((attachment, idx) => {
        contextParts.push(`\nAttachment ${idx + 1}: ${attachment.filename}`);
        contextParts.push(`Size: ${(attachment.size / 1024).toFixed(1)} KB`);
        
        if (attachment.matchingChunks && attachment.matchingChunks.length > 0) {
          contextParts.push('\nRelevant content:');
          attachment.matchingChunks.forEach((chunk: any, chunkIdx: number) => {
            contextParts.push(`\n[Chunk ${chunkIdx + 1}]: ${chunk.chunk_text.substring(0, 500)}...`);
          });
        }
        contextParts.push('\n');
      });
    }

    const context = contextParts.join('\n');

    // Step 7: Generate response using OpenAI Chat Completion
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const systemPrompt = `You are a helpful email assistant. You help users find and understand information from their emails.
        When answering questions:
        - Be concise and natural, as if speaking to someone
        - Use the context provided from relevant emails and attachments
        - For questions about "last email", "recent email", or "latest email", use the most recent email in the context (sorted by date)
        - If you find relevant information, reference specific emails with details like sender, subject, and date (e.g., "Your last email was from John Doe on March 15th about the project update. It said...")
        - When answering about the last/recent email, provide the subject, sender, date, and a brief summary
        - If no relevant information is found in the context, say so clearly
        - Keep responses conversational and brief (2-3 sentences for simple questions, up to a paragraph for complex ones)
        - Don't make up information - only use what's in the context`;

    const userPrompt = `User question: "${transcript}"\n\nRelevant context from emails and attachments:\n${context || 'No relevant emails or attachments found.'}\n\nPlease provide a helpful answer based on this context.`;

    let responseText: string;
    try {
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using cheaper model for responses
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      responseText = chatResponse.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
    } catch (error: any) {
      console.error('OpenAI Chat API error:', error);
      // Fallback response
      if (emails.length > 0 || attachments.length > 0) {
        responseText = `I found ${emails.length} relevant email(s) and ${attachments.length} relevant attachment(s), but couldn't generate a detailed response. Please check the results manually.`;
      } else {
        responseText = 'I could not find any relevant emails or attachments matching your query.';
      }
    }

    return NextResponse.json({
      transcript,
      response: responseText,
      results: {
        emails: emails.slice(0, 5).map((e) => ({
          id: e.id,
          subject: e.subject,
          from: e.from_name,
          fromEmail: e.from_email,
          date: e.date,
          relevance: e.maxSimilarity,
        })),
        attachments: attachments.slice(0, 3).map((a) => ({
          id: a.id,
          filename: a.filename,
          emailId: a.email_id,
          relevance: a.maxSimilarity,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error processing voice query:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process voice query' },
      { status: 500 }
    );
  }
}

