import React, { useState } from 'react';
import { X, Plus, Radio, Check } from 'lucide-react';

interface PathManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePath: (pathName: string) => void;
  theme?: 'light' | 'dark';
}

export const PathManagerModal: React.FC<PathManagerModalProps> = ({
  isOpen,
  onClose,
  onCreatePath,
  theme = 'light'
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const [pathName, setPathName] = useState<string>('live/cam2');
  const [error, setError] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathName.trim()) {
      setError('Path name cannot be empty');
      return;
    }
    onCreatePath(pathName.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className={`border rounded-xl w-full max-w-md shadow-2xl overflow-hidden ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold font-mono">Create Stream Path Config</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Register new MediaMTX path endpoint
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 font-mono">
          
          <div className="space-y-1">
            <label className={`text-xs font-semibold block font-sans ${
              isDark ? 'text-slate-300' : 'text-slate-700'
            }`}>
              MediaMTX Path Name
            </label>
            <input
              type="text"
              value={pathName}
              onChange={(e) => {
                setPathName(e.target.value);
                setError('');
              }}
              placeholder="e.g. live/cam2 or event/stage1"
              className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className={`p-2.5 border rounded-lg text-xs space-y-0.5 ${
            isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <p className="font-semibold text-slate-700 dark:text-slate-300 font-sans">RTMP Publish Endpoint:</p>
            <p className="text-emerald-600 dark:text-emerald-400 font-bold break-all">
              rtmp://127.0.0.1:1935/{pathName || 'live/cam2'}
            </p>
          </div>

          <div className={`flex items-center justify-end space-x-2 pt-3 border-t font-sans ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Path</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

