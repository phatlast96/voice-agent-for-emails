'use client';

import { makeAutoObservable } from 'mobx';
import { createContext, useContext, ReactNode, useMemo } from 'react';

export interface Credential {
  id: string;
  name: string;
  value: string;
  masked: boolean;
}

const DEFAULT_CREDENTIALS: Credential[] = [
  { id: '1', name: 'OpenAI API Key', value: '', masked: true },
  { id: '3', name: 'Nylas API Key', value: '', masked: true },
  { id: '4', name: 'Nylas Grant ID', value: '', masked: false },
];

class CredentialsStore {
  credentials: Credential[] = [...DEFAULT_CREDENTIALS];

  saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

  constructor() {
    makeAutoObservable(this);
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('credentials');
      if (stored) {
        const parsed: Credential[] = JSON.parse(stored);
        // Merge stored credentials with defaults to ensure all credentials exist
        this.credentials = DEFAULT_CREDENTIALS.map(defaultCred => {
          const storedCred = parsed.find(c => c.id === defaultCred.id);
          return storedCred
            ? { ...storedCred, masked: true } // Always mask when loading
            : defaultCred;
        });
      }
    } catch (error) {
      console.error('Failed to load credentials from storage:', error);
      // Keep default credentials on error
    }
  }

  updateCredential(id: string, value: string) {
    const credential = this.credentials.find(c => c.id === id);
    if (credential) {
      credential.value = value;
    }
  }

  toggleCredentialVisibility(id: string) {
    const credential = this.credentials.find(c => c.id === id);
    if (credential) {
      credential.masked = !credential.masked;
    }
  }

  async saveCredentials() {
    this.saveStatus = 'saving';

    try {
      if (typeof window !== 'undefined') {
        // Mask all credentials before saving
        const credentialsToSave = this.credentials.map(cred => ({
          ...cred,
          masked: true,
        }));

        localStorage.setItem('credentials', JSON.stringify(credentialsToSave));
        
        // Reset masked state in store after save
        this.credentials.forEach(cred => {
          cred.masked = true;
        });

        this.saveStatus = 'saved';
        
        // Reset to idle after 2 seconds
        setTimeout(() => {
          this.saveStatus = 'idle';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save credentials:', error);
      this.saveStatus = 'error';
    }
  }

  getCredentialByName(name: string): Credential | undefined {
    return this.credentials.find(c => c.name === name);
  }

  getNylasApiKey(): string {
    return this.getCredentialByName('Nylas API Key')?.value || '';
  }

  getNylasGrantId(): string {
    return this.getCredentialByName('Nylas Grant ID')?.value || '';
  }

  hasAllCredentials(): boolean {
    return this.credentials.every(cred => cred.value.trim().length > 0);
  }
}

export type { CredentialsStore };

const CredentialsStoreContext = createContext<CredentialsStore | null>(null);

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new CredentialsStore(), []);
  return (
    <CredentialsStoreContext.Provider value={store}>
      {children}
    </CredentialsStoreContext.Provider>
  );
}

export function useCredentialsStore() {
  const store = useContext(CredentialsStoreContext);
  if (!store) {
    throw new Error('useCredentialsStore must be used within CredentialsProvider');
  }
  return store;
}

