'use client';

import { useEffect, useState } from 'react';
import { useCredentialsStore } from '../store/credentials.store';

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  is_inline?: boolean;
  content_id?: string;
}

export interface Email {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  date: Date;
  snippet: string;
  body?: string;
  hasAttachments?: boolean;
  hasEmbeddings?: boolean;
  attachments?: Attachment[];
}

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emails: Email[];
  isLoading?: boolean;
}

export function EmailModal({ isOpen, onClose, emails, isLoading = false }: EmailModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-4xl max-h-[90vh] rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Emails ({emails.length})
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Crawled emails from your inbox
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <svg className="h-8 w-8 animate-spin text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading emails...</p>
              </div>
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 mb-3">
                <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">No emails found</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                Start crawling to fetch emails from your inbox
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {emails.map((email) => (
                <EmailItem key={email.id} email={email} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailItem({ email }: { email: Email }) {
  const credentialsStore = useCredentialsStore();
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) {
      return (
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    } else if (contentType.includes('pdf')) {
      return (
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    } else {
      return (
        <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      );
    }
  };

  const handleDownloadAttachment = async (attachment: Attachment) => {
    const apiKey = credentialsStore.getNylasApiKey();
    const grantId = credentialsStore.getNylasGrantId();

    if (!apiKey.trim() || !grantId.trim()) {
      alert('Please configure your Nylas API Key and Grant ID in settings first.');
      return;
    }

    setDownloadingAttachmentId(attachment.id);

    try {
      const response = await fetch(`/api/emails/${email.id}/attachments/${attachment.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          grantId,
          download: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to download attachment');
      }

      // Get filename from Content-Disposition header or use attachment filename
      const contentDisposition = response.headers.get('content-disposition') || '';
      let filename = attachment.filename;
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      alert('Failed to download attachment. Please try again.');
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  return (
    <div className="p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 sm:p-6">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-sm font-medium text-white">
          {email.from.name.charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {email.from.name || email.from.email}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {email.from.email}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {email.hasAttachments && (
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              )}
              {email.hasEmbeddings === false && (
                <div
                  className="group relative flex items-center"
                  title="This email is not searchable by the voice agent. Embeddings were not generated (check OpenAI API key configuration)."
                >
                  <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-900/30">
                    <svg className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Not searchable</span>
                  </div>
                </div>
              )}
              <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {formatDate(email.date)}
              </span>
            </div>
          </div>

          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1.5 line-clamp-1">
            {email.subject || '(No subject)'}
          </p>

          <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {email.snippet || email.body || 'No preview available'}
          </p>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {email.attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  onClick={() => handleDownloadAttachment(attachment)}
                  disabled={downloadingAttachmentId === attachment.id}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  {getFileIcon(attachment.content_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatFileSize(attachment.size)}
                      {attachment.is_inline && ' • Inline'}
                    </p>
                  </div>
                  {downloadingAttachmentId === attachment.id ? (
                    <svg className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* To recipients */}
          {email.to.length > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span>To:</span>
              <span className="truncate">
                {email.to.map((recipient, idx) => (
                  <span key={idx}>
                    {recipient.name || recipient.email}
                    {idx < email.to.length - 1 && ', '}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

