'use client';

import { useState } from 'react';

type CrawlStatus = 'idle' | 'running' | 'completed' | 'error';

export function CrawlPanel() {
  const [status, setStatus] = useState<CrawlStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [lastCrawl, setLastCrawl] = useState<Date | null>(null);

  const startCrawl = async () => {
    setStatus('running');
    setProgress(0);

    // Simulate crawl progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus('completed');
          setLastCrawl(new Date());
          return 100;
        }
        return prev + 10;
      });
    }, 500);

    // TODO: Implement actual crawl API call
  };

  const stopCrawl = () => {
    setStatus('idle');
    setProgress(0);
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-zinc-400';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Crawling...';
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Email Crawl</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Index your emails and attachments</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Status</span>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{getStatusText()}</span>
            </div>
          </div>

          {status === 'running' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">Progress</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{progress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full ${getStatusColor()} transition-all duration-300`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {lastCrawl && status === 'completed' && (
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Last crawl: {lastCrawl.toLocaleString()}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {status === 'idle' || status === 'completed' || status === 'error' ? (
              <button
                onClick={startCrawl}
                className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:bg-purple-500 dark:hover:bg-purple-600"
              >
                Start Crawl
              </button>
            ) : (
              <button
                onClick={stopCrawl}
                className="flex-1 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-700 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-zinc-700"
              >
                Stop Crawl
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

