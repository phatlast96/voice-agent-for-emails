'use client';

import { CredentialsProvider, useCredentialsStore } from './credentials.store';
import { EmailProvider } from './email.store';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <CredentialsProvider>
      <EmailProviderWrapper>{children}</EmailProviderWrapper>
    </CredentialsProvider>
  );
}

function EmailProviderWrapper({ children }: { children: React.ReactNode }) {
  const credentialsStore = useCredentialsStore();
  return <EmailProvider credentialsStore={credentialsStore}>{children}</EmailProvider>;
}

