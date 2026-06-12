'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, FileText, Play, History, AlertCircle, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Home() {
  const [reports, setReports] = useState<string[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportContent, setReportContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // SSE Progress State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  const [error, setError] = useState<string | null>(null);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      if (Array.isArray(data)) {
        setReports(data);
      } else {
        setReports([]);
      }
    } catch (err) {
      console.error('Failed to fetch reports', err);
      setError((err as Error).message);
    }
  };

  const fetchReportContent = async (filename: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${filename}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setReportContent(data.content);
      setSelectedReport(filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const generateReport = async () => {
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStatusMessage('Connecting to server...');

    const eventSource = new EventSource('/api/reports/stream');

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          setError(data.error);
          setIsGenerating(false);
          eventSource.close();
          return;
        }

        setProgress(data.progress);
        setStatusMessage(data.status);

        if (data.progress === 100 && data.filename) {
          eventSource.close();
          await fetchReports();
          await fetchReportContent(data.filename);
          setIsGenerating(false);
          setTimeout(() => {
            setProgress(0);
            setStatusMessage('');
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      setError('Connection to server lost during analysis.');
      setIsGenerating(false);
      eventSource.close();
    };
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <main className="flex h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r dark:border-gray-800 flex flex-col bg-white dark:bg-zinc-950">
        <div className="p-4 border-b dark:border-gray-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Play className="text-blue-500 fill-blue-500" size={24} />
            PolyScraper
          </h1>
        </div>

        <div className="p-4 border-b dark:border-gray-800 space-y-2">
          <button
            onClick={generateReport}
            disabled={isGenerating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Scanning... {progress}%
              </>
            ) : (
              <>
                <Play size={18} />
                Run New Analysis
              </>
            )}
          </button>

          <Link
            href="/paper-trades"
            className="w-full bg-green-600/10 hover:bg-green-600/20 text-green-600 dark:text-green-400 font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors border border-green-600/20"
          >
            <DollarSign size={18} />
            Paper Trades
          </Link>
          
          {isGenerating && (
            <div className="mt-4 space-y-2">
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-center text-gray-500 dark:text-gray-400 font-medium font-mono truncate px-2">
                {statusMessage}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
            <History size={14} />
            Report History
          </div>
          <div className="space-y-1">
            {reports.map((report) => (
              <button
                key={report}
                onClick={() => fetchReportContent(report)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                  selectedReport === report
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                )}
              >
                <FileText size={16} className="shrink-0" />
                <span className="truncate">{report.replace('.md', '').split('T')[0]} {report.split('T')[1]?.split('-')[0].replace(/-/g, ':')}</span>
              </button>
            ))}
            {reports.length === 0 && (
              <div className="px-3 py-8 text-center text-gray-400 text-sm italic">
                No reports found. Run an analysis to get started.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative bg-white dark:bg-zinc-900">
        {error && (
          <div className="m-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg flex items-start gap-3 text-red-700 dark:text-red-400">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <h3 className="font-bold text-sm">Error Occurred</h3>
              <p className="text-sm opacity-90">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : selectedReport ? (
          <div className="max-w-4xl mx-auto p-8 lg:p-12">
            <div className="prose dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 px-6 text-center">
            <Play size={64} className="mb-4 opacity-10" />
            <h2 className="text-2xl font-semibold text-gray-500 dark:text-gray-400">Polymarket Leaderboard Scraper</h2>
            <p className="max-w-md mt-2">
              Select a report from the sidebar or click "Run New Analysis" to scrape the top 50 users and find consensus trades.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
