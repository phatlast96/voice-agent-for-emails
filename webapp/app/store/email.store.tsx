'use client';

import { makeAutoObservable } from 'mobx';
import { createContext, useContext, ReactNode, useMemo } from 'react';
import type { CredentialsStore } from './credentials.store';

export interface Email {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  date: Date;
  snippet: string;
  body?: string;
  hasAttachments?: boolean;
}

type CrawlStatus = 'idle' | 'running' | 'completed' | 'error';

class EmailStore {
  emails: Email[] = [];
  status: CrawlStatus = 'idle';
  progress = 0;
  lastCrawl: Date | null = null;
  error: string | null = null;

  constructor(private credentialsStore: CredentialsStore) {
    makeAutoObservable(this);
  }

  async startCrawl() {
    const apiKey = this.credentialsStore.getNylasApiKey();
    const grantId = this.credentialsStore.getNylasGrantId();

    if (!apiKey.trim()) {
      this.status = 'error';
      this.error = 'Please configure your Nylas API Key in settings first.';
      return;
    }

    if (!grantId.trim()) {
      this.status = 'error';
      this.error = 'Please configure your Nylas Grant ID in settings first.';
      return;
    }

    this.status = 'running';
    this.progress = 0;
    this.error = null;

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        if (this.progress < 90) {
          this.progress += 10;
        }
      }, 300);

      const response = await fetch('/api/emails/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, grantId }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch emails' }));
        throw new Error(errorData.error || 'Failed to fetch emails');
      }

      const data = await response.json();
      this.emails = data.emails.map((email: any) => ({
        ...email,
        date: new Date(email.date),
      }));
      this.progress = 100;
      this.status = 'completed';
      this.lastCrawl = new Date();
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : 'Unknown error occurred';
      this.progress = 0;
      console.error('Crawl failed:', error);
    }
  }

  stopCrawl() {
    this.status = 'idle';
    this.progress = 0;
    this.error = null;
  }

  async fetchEmailDetails(emailId: string): Promise<Email | null> {
    const apiKey = this.credentialsStore.getNylasApiKey();
    const grantId = this.credentialsStore.getNylasGrantId();

    if (!apiKey.trim() || !grantId.trim()) {
      return null;
    }

    try {
      const response = await fetch(`/api/emails/${emailId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, grantId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch email details');
      }

      const data = await response.json();
      return {
        ...data.email,
        date: new Date(data.email.date),
      };
    } catch (error) {
      console.error('Failed to fetch email details:', error);
      return null;
    }
  }

  clearEmails() {
    this.emails = [];
  }
}

const EmailStoreContext = createContext<EmailStore | null>(null);

export function EmailProvider({
  children,
  credentialsStore,
}: {
  children: ReactNode;
  credentialsStore: CredentialsStore;
}) {
  const store = useMemo(() => new EmailStore(credentialsStore), [credentialsStore]);
  return <EmailStoreContext.Provider value={store}>{children}</EmailStoreContext.Provider>;
}

export function useEmailStore() {
  const store = useContext(EmailStoreContext);
  if (!store) {
    throw new Error('useEmailStore must be used within EmailProvider');
  }
  return store;
}

