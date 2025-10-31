import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase';

interface FetchCrawlJobsRequest {
  grantId: string;
  limit?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: FetchCrawlJobsRequest = await request.json();
    const { grantId, limit = 50 } = body;

    if (!grantId) {
      return NextResponse.json(
        { error: 'Grant ID is required' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // Fetch crawl jobs from Supabase
    const { data: crawlJobs, error } = await supabase
      .from('crawl_jobs')
      .select('*')
      .eq('grant_id', grantId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching crawl jobs from Supabase:', error);
      return NextResponse.json(
        { error: 'Failed to fetch crawl jobs from database' },
        { status: 500 }
      );
    }

    // Transform crawl jobs to include Date objects
    const transformedJobs = (crawlJobs || []).map((job: any) => ({
      id: job.id,
      grantId: job.grant_id,
      status: job.status,
      emailsCrawled: job.emails_crawled,
      startedAt: new Date(job.started_at),
      completedAt: job.completed_at ? new Date(job.completed_at) : null,
      errorMessage: job.error_message,
      createdAt: new Date(job.created_at),
    }));

    return NextResponse.json({ crawlJobs: transformedJobs });
  } catch (error) {
    console.error('Error fetching crawl jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch crawl jobs' },
      { status: 500 }
    );
  }
}

