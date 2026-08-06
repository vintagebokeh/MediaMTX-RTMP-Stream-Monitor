import React, { useState } from 'react';
import {
  AlertOctagon,
  Copy,
  Download,
  FileText,
  HelpCircle,
  RefreshCw,
  X,
  Check
} from 'lucide-react';
import { getMemoryMonitorService } from '../services/memory/MemoryMonitorService';

interface EmergencyActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export const EmergencyActionsModal: React.FC<EmergencyActionsModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';
  const [showConfirmRestart, setShowConfirmRestart] = useState(false);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  if (!isOpen) return null;

  const memoryService = getMemoryMonitorService();
  const summary = memoryService.getMetricsSummary();
  const snapshot = memoryService.getDiagnosticSnapshot();

  const handleExportDiagnostics = () => {
    const jsonStr = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-diagnostic-snapshot-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSamples = () => {
    const jsonStr = JSON.stringify(summary.samples, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-samples-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    const latest = summary.latestSample;
    const text = `MEMORY DIAGNOSTIC SUMMARY
Health State: ${summary.healthState}
Leak Suspicion: ${summary.leakSuspicion}
Host Available: ${summary.availableRAMBytes ? (summary.availableRAMBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : 'N/A'} (${summary.availableRAMPercent}%)
Consumption Rate: ${summary.consumptionRateMBPerMin ?? 0} MB/min
Projected Critical: ${summary.projectedMinutesToCritical ? summary.projectedMinutesToCritical + ' min' : 'Projection unavailable'}
Browser Heap: ${latest?.browserHeapUsedBytes ? (latest.browserHeapUsedBytes / (1024 * 1024)).toFixed(0) + ' MB' : 'Unavailable'}
DOM Elements: Video: ${latest?.videoElementCount ?? 0}, iframe: ${latest?.iframeCount ?? 0}, Canvas: ${latest?.canvasCount ?? 0}, Animation Loops: ${latest?.activeAnimationLoops ?? 0}
Timestamp: ${new Date().toISOString()}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy summary:', err);
    }
  };

  const handleConfirmRestart = () => {
    window.location.reload();
  };

  return (
    <div
      id="emergency-actions-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className={`w-full max-w-xl rounded-xl border p-6 shadow-2xl space-y-5 ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg tracking-tight">Operator Memory Actions</h3>
              <p className="text-xs text-slate-400">Diagnostic evidence preservation & recovery tools</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Highlight */}
        <div className={`p-4 rounded-lg border text-sm space-y-1 ${
          summary.healthState === 'EMERGENCY'
            ? 'bg-purple-950/50 border-purple-800 text-purple-200'
            : summary.healthState === 'CRITICAL'
              ? 'bg-rose-950/50 border-rose-800 text-rose-200'
              : 'bg-amber-950/50 border-amber-800 text-amber-200'
        }`}>
          <div className="font-bold flex items-center justify-between">
            <span>HEALTH STATE: {summary.healthState}</span>
            <span className="text-xs font-mono">Leak: {summary.leakSuspicion}</span>
          </div>
          <div className="text-xs opacity-90">
            Available RAM: {summary.availableRAMPercent}% ({summary.availableRAMBytes ? (summary.availableRAMBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : 'N/A'})
            | Consumption Rate: {summary.consumptionRateMBPerMin ?? 0} MB/min
          </div>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Action 1: Export Diagnostics */}
          <button
            onClick={handleExportDiagnostics}
            className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Download className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <div className="font-semibold text-sm">Export Diagnostics</div>
              <div className="text-xs text-slate-400">Download full JSON snapshot for analysis</div>
            </div>
          </button>

          {/* Action 2: Download Memory Samples */}
          <button
            onClick={handleDownloadSamples}
            className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-semibold text-sm">Download Samples</div>
              <div className="text-xs text-slate-400">Export 360 rolling memory samples</div>
            </div>
          </button>

          {/* Action 3: Copy Summary */}
          <button
            onClick={handleCopySummary}
            className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {copySuccess ? (
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {copySuccess ? 'Copied to Clipboard!' : 'Copy Summary'}
              </div>
              <div className="text-xs text-slate-400">Copy diagnostic metrics text</div>
            </div>
          </button>

          {/* Action 4: Troubleshooting Guide */}
          <button
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className={`flex items-center gap-3 p-3.5 rounded-lg border text-left transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <HelpCircle className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="font-semibold text-sm">Troubleshooting Guide</div>
              <div className="text-xs text-slate-400">View diagnostic checklist & steps</div>
            </div>
          </button>
        </div>

        {/* Action 5: Restart Dashboard (With Confirmation Dialog) */}
        {!showConfirmRestart ? (
          <button
            onClick={() => setShowConfirmRestart(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Restart Dashboard...</span>
          </button>
        ) : (
          <div className="p-4 rounded-lg border border-rose-600 bg-rose-950/80 text-rose-100 space-y-3">
            <div className="font-bold text-sm">Operator Confirmation Required</div>
            <p className="text-xs text-rose-200">
              Restarting the dashboard will reload the browser page. Streaming telemetry subscribers will briefly reconnect. Are you sure?
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowConfirmRestart(false)}
                className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestart}
                className="px-3 py-1.5 rounded text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                Confirm Reload
              </button>
            </div>
          </div>
        )}

        {/* Troubleshooting Drawer */}
        {showTroubleshooting && (
          <div className="p-4 rounded-lg border border-slate-700 bg-slate-950 text-xs space-y-2">
            <div className="font-bold text-slate-200">Memory Pressure Troubleshooting Steps:</div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>Export diagnostics JSON before closing or reloading for root-cause analysis.</li>
              <li>Check DOM element counts (high video or canvas count can consume browser VRAM/RAM).</li>
              <li>Verify MediaMTX stream paths and disconnect idle readers if necessary.</li>
              <li>If browser heap approaches 90% limit, close secondary inactive dashboard tabs.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};
