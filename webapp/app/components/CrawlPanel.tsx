'use client';

import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useEmailStore } from '../store/email.store';
import { EmailModal } from './EmailModal';

export const CrawlPanel = observer(function CrawlPanel() {
  const emailStore = useEmailStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Fetch crawl jobs from database on mount/refresh
    emailStore.fetchCrawlJobs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Open modal automatically when crawl completes successfully
    if (emailStore.status === 'completed' && emailStore.emails.length > 0) {
      setIsModalOpen(true);
    }
  }, [emailStore.status, emailStore.emails.length]);

  useEffect(() => {
    // Refresh crawl jobs when crawl completes or errors
    if (emailStore.status === 'completed' || emailStore.status === 'error') {
      emailStore.fetchCrawlJobs();
    }
  }, [emailStore.status]);

  const startCrawl = async () => {
    await emailStore.startCrawl();
  };

  const stopCrawl = () => {
    emailStore.stopCrawl();
  };

  const getStatusColor = () => {
    switch (emailStore.status) {
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
    switch (emailStore.status) {
      case 'running':
        return 'Crawling...';
      case 'completed':
        return 'Completed';
      case 'error':
        return emailStore.error || 'Error';
      default:
        return 'Ready';
    }
  };

  const showEmails = () => {
    if (emailStore.emails.length > 0) {
      setIsModalOpen(true);
    }
  };

  return (
    <>
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

            {emailStore.status === 'running' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Progress</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{emailStore.progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full ${getStatusColor()} transition-all duration-300`}
                    style={{ width: `${emailStore.progress}%` }}
                  />
                </div>
              </div>
            )}

            {emailStore.error && emailStore.status === 'error' && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {emailStore.error}
                </p>
              </div>
            )}

            {/* Show latest crawl job info */}
            {emailStore.latestCrawlJob && (
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Latest Crawl
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    emailStore.latestCrawlJob.status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : emailStore.latestCrawlJob.status === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {emailStore.latestCrawlJob.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                  Started: {emailStore.latestCrawlJob.startedAt.toLocaleString()}
                </p>
                {emailStore.latestCrawlJob.completedAt && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">
                    Completed: {emailStore.latestCrawlJob.completedAt.toLocaleString()}
                  </p>
                )}
                {emailStore.latestCrawlJob.emailsCrawled > 0 && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Crawled {emailStore.latestCrawlJob.emailsCrawled} email{emailStore.latestCrawlJob.emailsCrawled !== 1 ? 's' : ''}
                  </p>
                )}
                {emailStore.latestCrawlJob.errorMessage && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Error: {emailStore.latestCrawlJob.errorMessage}
                  </p>
                )}
              </div>
            )}

            {/* Show crawl history if available */}
            {emailStore.crawlJobs.length > 1 && (
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  Crawl History ({emailStore.crawlJobs.length} total)
                </p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {emailStore.crawlJobs.slice(1, 4).map((job) => (
                    <div key={job.id} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {job.startedAt.toLocaleDateString()} {job.startedAt.toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          job.status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : job.status === 'error'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {job.status}
                        </span>
                        {job.emailsCrawled > 0 && (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {job.emailsCrawled}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              {emailStore.status === 'idle' || emailStore.status === 'completed' || emailStore.status === 'error' ? (
                <>
                  <button
                    onClick={startCrawl}
                    className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:bg-purple-500 dark:hover:bg-purple-600"
                  >
                    Start Crawl
                  </button>
                  {emailStore.status === 'completed' && emailStore.emails.length > 0 && (
                    <button
                      onClick={showEmails}
                      className="rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:border-purple-700 dark:bg-zinc-800 dark:text-purple-400 dark:hover:bg-zinc-700"
                    >
                      View Emails
                    </button>
                  )}
                </>
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

      <EmailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        emails={emailStore.emails}
        isLoading={emailStore.status === 'running'}
      />
    </>
  );
});

