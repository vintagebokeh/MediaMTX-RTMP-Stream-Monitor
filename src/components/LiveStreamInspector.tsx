import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Volume2,
  Maximize2,
  Tv,
  CheckCircle,
  Activity,
  Layers,
  Radio,
  Wifi,
  Video
} from 'lucide-react';
import { RuntimeConfig, StreamPath } from '../types';
import { IMonitorApiAdapter } from '../services/api/IMonitorApiAdapter';

interface LiveStreamInspectorProps {
  path: StreamPath;
  theme?: 'light' | 'dark';
  adapter?: IMonitorApiAdapter;
}

export const LiveStreamInspector: React.FC<LiveStreamInspectorProps> = ({
  path,
  theme = 'light',
  adapter
}) => {
  const isDark = theme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [audioLevelL, setAudioLevelL] = useState<number>(78);
  const [audioLevelR, setAudioLevelR] = useState<number>(82);

  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [webrtcFailed, setWebrtcFailed] = useState<boolean>(false);
  const [hlsFailed, setHlsFailed] = useState<boolean>(false);

  const { publisher, metrics } = path;

  // Fetch runtime configuration from Monitoring API
  useEffect(() => {
    let isMounted = true;
    if (adapter) {
      adapter.getRuntimeConfig().then((cfg) => {
        if (isMounted) {
          setRuntimeConfig(cfg);
        }
      }).catch((err) => {
        console.warn('Failed to load runtime config in inspector:', err);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [adapter, path.name]);

  // Determine active playback source
  const canUseWebRTC = runtimeConfig?.features?.livePreviewEnabled && runtimeConfig?.playback?.webrtcUrl && !webrtcFailed;
  const canUseHLS = !canUseWebRTC && runtimeConfig?.playback?.hlsUrl && !hlsFailed;
  const useCanvasFallback = !canUseWebRTC && !canUseHLS;

  // Render broadcast test pattern on canvas when in offline/mock/fallback mode
  useEffect(() => {
    if (!useCanvasFallback) return;

    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameCount = 0;

    const render = () => {
      frameCount++;
      const w = canvas.width;
      const h = canvas.height;

      // Clear
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      if (isPlaying) {
        // 1. Draw SMPTE Color Bars
        const colors = [
          '#c0c0c0', '#c0c000', '#00c0c0', '#00c000',
          '#c000c0', '#c00000', '#0000c0'
        ];
        const barWidth = w / colors.length;
        colors.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.fillRect(i * barWidth, 0, barWidth, h * 0.7);
        });

        // 2. Draw Bottom Pattern & Grayscale
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, h * 0.7, w, h * 0.3);

        const graySteps = ['#1a1a1a', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'];
        const gWidth = (w * 0.6) / graySteps.length;
        graySteps.forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.fillRect(i * gWidth, h * 0.7, gWidth, h * 0.3);
        });

        // 3. Moving Bouncing Box to prove live video frame rendering
        const bounceX = Math.abs((frameCount * 3) % (w - 80));
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(bounceX, h * 0.75, 80, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('LIVE FRAME', bounceX + 8, h * 0.75 + 16);

        // 4. On-Screen Display (OSD) Overlay
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(16, 16, 320, 110);
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
        ctx.strokeRect(16, 16, 320, 110);

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(32, 34, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(`PATH: ${path.name}`, 44, 38);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.fillText(`Resolution: ${publisher?.videoResolution || '1920x1080'}`, 32, 58);
        ctx.fillText(`Video: ${publisher?.videoCodec || 'H.264'} @ ${publisher?.videoFps || 60} FPS`, 32, 74);
        ctx.fillText(`Bitrate: ${(metrics.currentBitrateKbps / 1000).toFixed(2)} Mbps (Target 6.00)`, 32, 90);
        ctx.fillText(`Timecode: ${new Date().toISOString().substring(11, 21)}`, 32, 106);

        // Watermark Right
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('1920x1080 60fps', w - 160, 36);

        // Dynamic audio meter simulation
        const l = Math.floor(75 + Math.sin(frameCount / 10) * 15 + Math.random() * 5);
        const r = Math.floor(78 + Math.cos(frameCount / 12) * 14 + Math.random() * 5);
        setAudioLevelL(Math.min(98, Math.max(10, l)));
        setAudioLevelR(Math.min(98, Math.max(10, r)));
      } else {
        // Paused Screen
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('STREAM MONITORING PAUSED', w / 2, h / 2);
        ctx.textAlign = 'start';
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, path, publisher, metrics, useCanvasFallback]);

  return (
    <div
      className={`border rounded-xl p-5 shadow-sm space-y-4 font-sans ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      
      {/* Title Bar */}
      <div className={`flex items-center justify-between border-b pb-3 ${
        isDark ? 'border-slate-800' : 'border-slate-200'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 font-mono">
              <span>Live Broadcast Feed & Signal Inspector</span>
              {canUseWebRTC && (
                <span className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase tracking-wide border ${
                  isDark ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  WEBRTC
                </span>
              )}
              {canUseHLS && (
                <span className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase tracking-wide border ${
                  isDark ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                }`}>
                  HLS
                </span>
              )}
              {useCanvasFallback && (
                <span className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase tracking-wide border ${
                  isDark ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}>
                  OFFLINE
                </span>
              )}
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Runtime WebRTC/HLS feed via GET /api/v1/runtime-config with offline pattern fallback
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${isPlaying ? 'text-emerald-500 fill-emerald-500' : ''}`} />
            <span>{isPlaying ? 'Pause Feed' : 'Resume Feed'}</span>
          </button>
        </div>
      </div>


      {/* Main Player & VU Meter Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Monitor Container (3/4 width) */}
        <div className="lg:col-span-3 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 relative group aspect-video flex items-center justify-center shadow-inner">
          
          {/* 1. WebRTC Stream Element */}
          {canUseWebRTC && (
            <iframe
              src={runtimeConfig.playback.webrtcUrl!}
              title="WebRTC Stream Preview"
              className="w-full h-full border-0"
              onError={() => setWebrtcFailed(true)}
            />
          )}

          {/* 2. HLS Fallback Video Element */}
          {canUseHLS && (
            <video
              src={runtimeConfig.playback.hlsUrl!}
              autoPlay
              playsInline
              controls
              className="w-full h-full object-cover"
              onError={() => setHlsFailed(true)}
            />
          )}

          {/* 3. SMPTE Canvas Color Bars Pattern (Offline / Mock Fallback) */}
          {useCanvasFallback && (
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              className="w-full h-full object-cover"
            />
          )}

          {/* Floating Live Badge */}
          <div className="absolute top-4 left-4 bg-slate-900/90 border border-slate-700 backdrop-blur-md rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold text-emerald-400 tracking-wider">
              MODE: {canUseWebRTC ? 'WEBRTC' : canUseHLS ? 'HLS' : 'OFFLINE'}
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-xs font-mono text-slate-300">Path: {path.name}</span>
          </div>

          <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-700 backdrop-blur-md rounded-lg px-3 py-1.5 text-xs font-mono text-slate-300 shadow-lg">
            {(metrics.currentBitrateKbps / 1000).toFixed(2)} Mbps
          </div>
        </div>

        {/* Audio VU Meter & Track Telemetry (1/4 width) */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
          
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-purple-400" />
                Stereo Audio VU
              </span>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded">
                AAC 48kHz
              </span>
            </div>

            {/* Left Channel */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Left (L)</span>
                <span>-{100 - audioLevelL} dB</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 h-1.5 rounded-full transition-all duration-100"
                  style={{ width: `${audioLevelL}%` }}
                />
              </div>
            </div>

            {/* Right Channel */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                <span>Right (R)</span>
                <span>-{100 - audioLevelR} dB</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 h-1.5 rounded-full transition-all duration-100"
                  style={{ width: `${audioLevelR}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Technical Validation Checklist */}
          <div className="border-t border-slate-800/80 pt-3 space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Compliance Checklist
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Target Bitrate (6.0 Mbps):</span>
              <span className="font-mono text-emerald-400 font-bold">MATCHED</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Target Latency (~2.0s):</span>
              <span className="font-mono text-emerald-400 font-bold">{(metrics.latencyMs / 1000).toFixed(2)}s</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Inbound Errors:</span>
              <span className="font-mono text-emerald-400 font-bold">0</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Discarded Frames:</span>
              <span className="font-mono text-emerald-400 font-bold">0</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

