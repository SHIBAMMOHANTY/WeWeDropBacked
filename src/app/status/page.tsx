'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ServiceHealth {
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'NOT_CONFIGURED';
  type: string;
  latencyMs?: number;
  details: string;
}

interface StatusData {
  success: boolean;
  status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  timestamp: string;
  responseTimeMs: number;
  server: {
    uptimeSeconds: number;
    formattedUptime: string;
    bootTime: string;
    nodeVersion: string;
    environment: string;
    platform: string;
    arch: string;
  };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    heapPercent: number;
  };
  services: ServiceHealth[];
  rebootLog: Array<{
    event: string;
    timestamp: string;
    reason: string;
    status: string;
  }>;
}

export default function SystemStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5000); // 5s default
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [liveUptime, setLiveUptime] = useState<number>(0);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch status`);
      }
      const json: StatusData = await res.json();
      setData(json);
      setLiveUptime(json.server.uptimeSeconds);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error('Status fetch error:', err);
      setError(err.message || 'Unable to connect to status backend');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchStatus();
    if (autoRefreshInterval <= 0) return;

    const timer = setInterval(() => {
      fetchStatus();
    }, autoRefreshInterval);

    return () => clearInterval(timer);
  }, [fetchStatus, autoRefreshInterval]);

  // Live second-by-second ticker for uptime counter
  useEffect(() => {
    const ticker = setInterval(() => {
      setLiveUptime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const formatSecondsToReadable = (totalSec: number) => {
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${days > 0 ? `${days}d ` : ''}${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'OPERATIONAL':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'DEGRADED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'DOWN':
      case 'OUTAGE':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">System Status & Uptime</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Live Monitor
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Real-time monitoring of backend servers, reboot timestamps, database latency, and service health.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-slate-900 text-slate-300 text-xs rounded-lg px-3 py-2 border border-slate-800 focus:outline-none focus:border-indigo-500"
            >
              <option value={5000}>Auto Refresh: Every 5s</option>
              <option value={15000}>Auto Refresh: Every 15s</option>
              <option value={30000}>Auto Refresh: Every 30s</option>
              <option value={0}>Manual Only</option>
            </select>

            <button
              onClick={() => {
                setLoading(true);
                fetchStatus();
              }}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : '🔄 Refresh Now'}
            </button>
          </div>
        </div>

        {/* Global Hero Status Banner */}
        {error ? (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-rose-400 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-bold text-lg">System Status Unreachable</div>
                <div className="text-xs text-rose-300/80">{error}</div>
              </div>
            </div>
            <button
              onClick={fetchStatus}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div
                    className={`w-5 h-5 rounded-full ${
                      data?.status === 'OPERATIONAL'
                        ? 'bg-emerald-500'
                        : data?.status === 'DEGRADED'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <div
                    className={`absolute -inset-1 rounded-full animate-ping opacity-50 ${
                      data?.status === 'OPERATIONAL'
                        ? 'bg-emerald-500'
                        : data?.status === 'DEGRADED'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Current Global System Status
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                    {data?.status === 'OPERATIONAL' && 'All Systems Operational'}
                    {data?.status === 'DEGRADED' && 'Partial System Degradation'}
                    {data?.status === 'OUTAGE' && 'System Outage Detected'}
                    {!data && 'Checking Status...'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs text-slate-400 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
                <div>
                  <span className="block text-slate-500">Last Checked</span>
                  <span className="font-mono text-slate-200">{lastRefreshedAt.toLocaleTimeString()}</span>
                </div>
                <div>
                  <span className="block text-slate-500">API Response Ping</span>
                  <span className="font-mono text-emerald-400 font-semibold">{data?.responseTimeMs ?? 0} ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Core Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Server Uptime */}
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
              <span>Server Process Uptime</span>
              <span className="text-emerald-400 font-mono">🟢 Live</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-emerald-400">
              {formatSecondsToReadable(liveUptime)}
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-2.5 flex justify-between">
              <span>Last Reboot:</span>
              <span className="font-mono text-slate-300">
                {data?.server.bootTime ? new Date(data.server.bootTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
              </span>
            </div>
          </div>

          {/* Card 2: Database Latency */}
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
              <span>Database Ping (MongoDB)</span>
              <span className="text-indigo-400 font-mono">Prisma</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-white">
              {data?.services.find((s) => s.type === 'DATABASE')?.latencyMs ?? -1}{' '}
              <span className="text-sm font-normal text-slate-400">ms</span>
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-2.5 flex justify-between">
              <span>Status:</span>
              <span className="font-semibold text-emerald-400">
                {data?.services.find((s) => s.type === 'DATABASE')?.status || 'UNKNOWN'}
              </span>
            </div>
          </div>

          {/* Card 3: Memory Usage */}
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
              <span>Node.js Memory Heap</span>
              <span className="font-mono text-slate-300">{data?.memory.heapPercent ?? 0}%</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono text-white">
              {data?.memory.heapUsedMb ?? 0} <span className="text-sm font-normal text-slate-400">/ {data?.memory.heapTotalMb ?? 0} MB</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(data?.memory.heapPercent || 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Card 4: Runtime Environment */}
          <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-400 font-medium">
              <span>Runtime Environment</span>
              <span className="text-sky-400 font-mono">{data?.server.environment || 'production'}</span>
            </div>
            <div className="text-lg font-bold tracking-tight font-mono text-white truncate">
              Node {data?.server.nodeVersion || 'v18'}
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-2.5 flex justify-between">
              <span>Platform:</span>
              <span className="font-mono text-slate-300">
                {data?.server.platform} ({data?.server.arch})
              </span>
            </div>
          </div>

        </div>

        {/* Services Status Table */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-base font-bold text-white">Services & Infrastructure Health</h2>
            <span className="text-xs text-slate-400">Component Breakdown</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {data?.services.map((service, idx) => (
              <div key={idx} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <div className="text-sm font-semibold text-white">{service.name}</div>
                    <div className="text-xs text-slate-400">{service.details}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  {service.latencyMs !== undefined && service.latencyMs >= 0 && (
                    <span className="font-mono text-slate-400">{service.latencyMs} ms</span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(
                      service.status
                    )}`}
                  >
                    {service.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Server Reboot & Event Log */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-white">Reboot & Boot Logs</h2>
            <span className="text-xs text-slate-400">Process Events</span>
          </div>

          <div className="space-y-3">
            {data?.rebootLog.map((log, idx) => (
              <div
                key={idx}
                className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">🚀</span>
                  <div>
                    <span className="font-semibold text-slate-200">{log.event}</span>
                    <span className="text-slate-500 block sm:inline sm:ml-2">({log.reason})</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-slate-400">
                  <span>Booted: {new Date(log.timestamp).toLocaleString()}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
