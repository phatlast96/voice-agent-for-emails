/**
 * Attachment content extractor service
 * Extracts text from various file types for embedding generation
 */

export interface ExtractedText {
  text: string;
  success: boolean;
  error?: string;
}

/**
 * Extract text from attachment content based on content type
 * @param buffer - File buffer/array buffer
 * @param contentType - MIME type of the file
 * @param filename - Optional filename for better type detection
 */
export async function extractTextFromAttachment(
  buffer: ArrayBuffer,
  contentType: string,
  filename?: string
): Promise<ExtractedText> {
  try {
    // Handle plain text files
    if (contentType.startsWith('text/')) {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(buffer);
      return { text: text.trim(), success: true };
    }

    // Handle JSON files
    if (contentType === 'application/json') {
      const decoder = new TextDecoder('utf-8');
      const jsonText = decoder.decode(buffer);
      try {
        const json = JSON.parse(jsonText);
        // Convert JSON to readable text
        const text = JSON.stringify(json, null, 2);
        return { text, success: true };
      } catch {
        return { text: jsonText, success: true };
      }
    }

    // Handle HTML files
    if (contentType === 'text/html') {
      const decoder = new TextDecoder('utf-8');
      const html = decoder.decode(buffer);
      // Basic HTML tag removal - could be enhanced with a proper HTML parser
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { text, success: true };
    }

    // Handle CSV files
    if (contentType === 'text/csv' || (filename && filename.endsWith('.csv'))) {
      const decoder = new TextDecoder('utf-8');
      const csv = decoder.decode(buffer);
      return { text: csv, success: true };
    }

    // Handle PDF files - requires pdf-parse or similar library
    // For now, return error suggesting implementation
    if (contentType === 'application/pdf' || (filename && filename.endsWith('.pdf'))) {
      return {
        text: '',
        success: false,
        error: 'PDF extraction not yet implemented. Consider adding pdf-parse library.',
      };
    }

    // Handle DOCX files - requires mammoth or similar library
    if (
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      (filename && filename.endsWith('.docx'))
    ) {
      return {
        text: '',
        success: false,
        error: 'DOCX extraction not yet implemented. Consider adding mammoth library.',
      };
    }

    // Handle DOC files - requires antiword or similar
    if (
      contentType === 'application/msword' ||
      (filename && filename.endsWith('.doc'))
    ) {
      return {
        text: '',
        success: false,
        error: 'DOC extraction not yet implemented. Consider adding a DOC parser library.',
      };
    }

    // Handle images - would require OCR
    if (contentType.startsWith('image/')) {
      return {
        text: '',
        success: false,
        error: 'Image OCR not yet implemented. Consider adding Tesseract.js or similar.',
      };
    }

    // For unknown types, try to decode as UTF-8 text as fallback
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(buffer);
      // If it decodes without too many replacement characters, return it
      if (text.length > 0 && !text.includes('\ufffd')) {
        return { text: text.trim(), success: true };
      }
    } catch {
      // Fall through to error
    }

    return {
      text: '',
      success: false,
      error: `Unsupported content type: ${contentType}`,
    };
  } catch (error) {
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error extracting text',
    };
  }
}

/**
 * Chunk text into smaller pieces for embedding
 * Splits text into chunks of approximately maxTokens tokens
 * @param text - Text to chunk
 * @param maxTokens - Maximum tokens per chunk (default ~8000 tokens ≈ 6000 characters)
 * @param overlap - Number of characters to overlap between chunks (default 200)
 */
export function chunkText(text: string, maxTokens: number = 8000, overlap: number = 200): string[] {
  // Rough approximation: 1 token ≈ 4 characters
  const maxChars = Math.floor(maxTokens * 4);
  
  if (text.length <= maxChars) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;
    
    // If not at the end, try to break at a sentence boundary
    if (end < text.length) {
      // Look for sentence endings within the last 20% of the chunk
      const searchStart = Math.max(start + Math.floor(maxChars * 0.8), start);
      const searchEnd = Math.min(end, text.length);
      const searchText = text.substring(searchStart, searchEnd);
      
      // Try to find sentence boundaries
      const sentenceEnd = searchText.search(/[.!?]\s+/);
      if (sentenceEnd !== -1) {
        end = searchStart + sentenceEnd + 1;
      } else {
        // Try to find paragraph breaks
        const paragraphEnd = searchText.search(/\n\n+/);
        if (paragraphEnd !== -1) {
          end = searchStart + paragraphEnd + 1;
        } else {
          // Try to find word boundaries
          const wordEnd = searchText.search(/\s+/);
          if (wordEnd !== -1) {
            end = searchStart + wordEnd + 1;
          }
        }
      }
    }

    chunks.push(text.substring(start, end).trim());
    
    // Move start position with overlap
    start = Math.max(start + 1, end - overlap);
  }

  return chunks.filter(chunk => chunk.length > 0);
}

