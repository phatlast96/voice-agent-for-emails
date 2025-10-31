'use client';

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useCredentialsStore } from '../store/credentials.store';

export const SettingsPanel = observer(function SettingsPanel() {
  const credentialsStore = useCredentialsStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSave = async () => {
    await credentialsStore.saveCredentials();
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Authentication & Keys</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Configure API keys and credentials</p>
          </div>
        </div>
        <svg
          className={`h-5 w-5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="space-y-4">
            {credentialsStore.credentials.map((credential) => (
              <div key={credential.id} className="space-y-2">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {credential.name}
                </label>
                <div className="flex gap-2">
                  <input
                    type={credential.masked ? 'password' : 'text'}
                    value={credential.value}
                    onChange={(e) => credentialsStore.updateCredential(credential.id, e.target.value)}
                    placeholder="Enter your API key"
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-blue-400"
                  />
                  <button
                    onClick={() => credentialsStore.toggleCredentialVisibility(credential.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    aria-label={credential.masked ? 'Show' : 'Hide'}
                  >
                    {credential.masked ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={handleSave}
              disabled={credentialsStore.saveStatus === 'saving'}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {credentialsStore.saveStatus === 'saving' && 'Saving...'}
              {credentialsStore.saveStatus === 'saved' && '✓ Saved'}
              {credentialsStore.saveStatus === 'error' && '✗ Error - Try Again'}
              {credentialsStore.saveStatus === 'idle' && 'Save Configuration'}
            </button>

            {credentialsStore.hasAllCredentials() && credentialsStore.saveStatus === 'saved' && (
              <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
                <p className="text-xs font-medium text-green-600 dark:text-green-400">
                  ✓ All credentials configured
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
