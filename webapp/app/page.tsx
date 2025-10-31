import { Header } from './components/Header';
import { SettingsPanel } from './components/SettingsPanel';
import { CrawlPanel } from './components/CrawlPanel';
import { VoiceQuery } from './components/VoiceQuery';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 space-y-1">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Email Voice Agent
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Configure your settings, crawl emails, and query via voice
          </p>
        </div>

        <div className="space-y-4">
          <SettingsPanel />
          <CrawlPanel />
          <VoiceQuery />
        </div>

        {/* Info Section */}
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start gap-3">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg className="h-3 w-3 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Getting Started
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Start by configuring your API keys in the settings panel above. Once configured, you can crawl your emails and start asking questions via voice.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
