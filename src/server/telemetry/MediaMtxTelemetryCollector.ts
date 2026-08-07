import { BitrateCompliance, NormalizedStreamSnapshot, TelemetryState } from '../../types';

export interface ByteSample {
  bytes: number;
  sampledAtMonotonicMs: number;
  metricSource: 'prometheus' | 'control-api' | 'none';
}

export interface BitrateDiagnostics {
  currentBytes: number | null;
  previousBytes: number | null;
  deltaBytes: number | null;
  elapsedMs: number | null;
  bitrateBps: number | null;
  bitrateKbps: number | null;
  smoothedBitrateKbps: number | null;
  selectedMetricSource: 'prometheus' | 'control-api' | 'none';
  sampledAt: string;
}

export interface PathBitrateHistory {
  smoothedBitrate: number | null;
  samples: Array<{ kbps: number; timestampMs: number }>;
}

export interface MediaMtxCollectorConfig {
  controlApiUrl: string;
  metricsUrl: string;
}

export class MediaMtxTelemetryCollector {
  private byteSamples = new Map<string, ByteSample>();
  private pathDiagnostics = new Map<string, BitrateDiagnostics>();
  private pathBitrateHistory = new Map<string, PathBitrateHistory>();
  private collectorSequence = 0;
  private controlApiUrl: string;
  private metricsUrl: string;

  constructor(config?: Partial<MediaMtxCollectorConfig>) {
    this.controlApiUrl = (config?.controlApiUrl || 'http://127.0.0.1:9997').replace(/\/+$/, '');
    this.metricsUrl = config?.metricsUrl || 'http://127.0.0.1:9998/metrics';
  }

  public getByteSamplesMap(): Map<string, ByteSample> {
    return this.byteSamples;
  }

  public clearByteSample(pathName: string): void {
    this.byteSamples.delete(pathName);
    this.pathDiagnostics.delete(pathName);
    this.pathBitrateHistory.delete(pathName);
  }

  public getCollectorSequence(): number {
    return this.collectorSequence;
  }

  /**
   * Helper to parse Prometheus metrics text
   */
  public parseMetrics(text: string): {
    pathInboundBytes: Map<string, number>;
    pathOutboundBytes: Map<string, number>;
    pathInboundFramesInError: Map<string, number>;
    rtmpConns: Array<{ id: string; path: string; remoteAddr: string; state: string }>;
    webRtcSessions: Array<{ id: string; path: string; remoteAddr: string; state: string }>;
  } {
    const pathInboundBytes = new Map<string, number>();
    const pathOutboundBytes = new Map<string, number>();
    const pathInboundFramesInError = new Map<string, number>();
    const rtmpConns: Array<{ id: string; path: string; remoteAddr: string; state: string }> = [];
    const webRtcSessions: Array<{ id: string; path: string; remoteAddr: string; state: string }> = [];

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // paths_inbound_bytes{name="live/test",state="ready"} 17847013
      let m = trimmed.match(/^paths_inbound_bytes\{[^}]*name="([^"]+)"[^}]*\}\s+(\d+)/);
      if (m) {
        pathInboundBytes.set(m[1], parseInt(m[2], 10));
        continue;
      }

      // paths_outbound_bytes{name="live/test",state="ready"} 13849482
      m = trimmed.match(/^paths_outbound_bytes\{[^}]*name="([^"]+)"[^}]*\}\s+(\d+)/);
      if (m) {
        pathOutboundBytes.set(m[1], parseInt(m[2], 10));
        continue;
      }

      // paths_inbound_frames_in_error{name="live/test",state="ready"} 0
      m = trimmed.match(/^paths_inbound_frames_in_error\{[^}]*name="([^"]+)"[^}]*\}\s+(\d+)/);
      if (m) {
        pathInboundFramesInError.set(m[1], parseInt(m[2], 10));
        continue;
      }

      // rtmp_conns{id="...",path="...",remoteAddr="...",state="publish"} 1
      m = trimmed.match(/^rtmp_conns\{[^}]*id="([^"]+)"[^}]*path="([^"]+)"[^}]*remoteAddr="([^"]+)"[^}]*state="([^"]+)"/);
      if (m) {
        rtmpConns.push({ id: m[1], path: m[2], remoteAddr: m[3], state: m[4] });
        continue;
      }

      // webrtc_sessions{id="...",path="...",remoteAddr="...",state="read"} 1
      m = trimmed.match(/^webrtc_sessions\{[^}]*id="([^"]+)"[^}]*path="([^"]+)"[^}]*remoteAddr="([^"]+)"[^}]*state="([^"]+)"/);
      if (m) {
        webRtcSessions.push({ id: m[1], path: m[2], remoteAddr: m[3], state: m[4] });
        continue;
      }
    }

    return {
      pathInboundBytes,
      pathOutboundBytes,
      pathInboundFramesInError,
      rtmpConns,
      webRtcSessions
    };
  }

  /**
   * Process raw MediaMTX path JSON and parsed metrics into NormalizedStreamSnapshot
   */
  public normalizePathSnapshot(
    rawPath: any,
    connsData?: {
      rtmpConns?: any[];
      webRtcSessions?: any[];
      metricsData?: ReturnType<typeof this.parseMetrics>;
    } | any[],
    webRtcSessionsOrNowMs?: any[] | number | string,
    metricsDataOrNowMs?: ReturnType<typeof this.parseMetrics> | number | string,
    sampledAtTime?: number | string,
    forcedMonotonicMs?: number
  ): NormalizedStreamSnapshot {
    let rtmpConns: any[] = [];
    let webRtcSessions: any[] = [];
    let metricsData: ReturnType<typeof this.parseMetrics> | undefined = undefined;
    let nowMs: number = Date.now();

    if (Array.isArray(connsData)) {
      rtmpConns = connsData;
      webRtcSessions = Array.isArray(webRtcSessionsOrNowMs) ? webRtcSessionsOrNowMs : [];
      metricsData = typeof metricsDataOrNowMs === 'object' && metricsDataOrNowMs !== null ? (metricsDataOrNowMs as any) : undefined;
      const rawTime = sampledAtTime ?? (typeof metricsDataOrNowMs === 'number' || typeof metricsDataOrNowMs === 'string' ? metricsDataOrNowMs : Date.now());
      nowMs = typeof rawTime === 'number' ? rawTime : (Date.parse(String(rawTime)) || Date.now());
    } else {
      rtmpConns = connsData?.rtmpConns || [];
      webRtcSessions = connsData?.webRtcSessions || [];
      metricsData = connsData?.metricsData;
      const rawTime = (webRtcSessionsOrNowMs as number | string) ?? Date.now();
      nowMs = typeof rawTime === 'number' ? rawTime : (Date.parse(String(rawTime)) || Date.now());
    }

    const hasExplicitTimestamp = sampledAtTime !== undefined || (typeof metricsDataOrNowMs === 'string' || typeof metricsDataOrNowMs === 'number') || (typeof webRtcSessionsOrNowMs === 'string' || typeof webRtcSessionsOrNowMs === 'number');

    const currentMonotonicMs = forcedMonotonicMs !== undefined
      ? forcedMonotonicMs
      : (hasExplicitTimestamp ? nowMs : (typeof performance !== 'undefined' ? performance.now() : nowMs));

    const pathName = rawPath.name || 'unknown';
    const isReady = Boolean(rawPath.ready);
    const isAvailable = Boolean(rawPath.available ?? isReady);
    const isOnline = Boolean(rawPath.online ?? isReady);

    // 1. Publisher Details
    let publisherConnected = false;
    let pubType: "RTMP" | "RTSP" | "SRT" | "WHIP" | "UNKNOWN" | null = null;
    let pubSourceType: string | null = null;
    let pubId: string | null = null;
    let pubRemoteAddr: string | null = null;

    if (rawPath.source && typeof rawPath.source === 'object' && rawPath.source.id) {
      pubSourceType = rawPath.source.type || null;
      pubId = rawPath.source.id || null;

      if (pubSourceType === 'rtmpConn' || pubSourceType === 'rtmpsConn') {
        pubType = 'RTMP';
      } else if (pubSourceType === 'rtspConn' || pubSourceType === 'rtspSource' || pubSourceType === 'rtspsConn') {
        pubType = 'RTSP';
      } else if (pubSourceType === 'srtConn') {
        pubType = 'SRT';
      } else if (pubSourceType === 'whipSession') {
        pubType = 'WHIP';
      } else if (pubSourceType) {
        pubType = 'UNKNOWN';
      }

      // Find remote address and verify state from API lists or metrics
      if (pubId) {
        const rtmpMatch = rtmpConns.find(
          c => c.id === pubId || c.id === rawPath.source.id
        );
        if (rtmpMatch) {
          pubRemoteAddr = rtmpMatch.remoteAddr || rtmpMatch.remoteAddress || null;
          if (rtmpMatch.state === 'publish' || rtmpMatch.state === 'publishing') {
            publisherConnected = true;
          }
        }

        if (!publisherConnected && metricsData) {
          const metricRtmp = metricsData.rtmpConns.find(c => c.id === pubId);
          if (metricRtmp) {
            pubRemoteAddr = metricRtmp.remoteAddr || null;
            if (metricRtmp.state === 'publish' || metricRtmp.state === 'publishing') {
              publisherConnected = true;
            }
          }
        }

        if (!publisherConnected && pubSourceType && pubId && isReady) {
          publisherConnected = true;
        }
      }
    }

    if (!publisherConnected) {
      pubType = null;
      pubSourceType = null;
      pubId = null;
      pubRemoteAddr = null;
    }

    // 2. Readers Resolution
    const rawReaders = Array.isArray(rawPath.readers) ? rawPath.readers : [];
    const readerItems = rawReaders.map(r => {
      let remoteAddress: string | null = null;
      if (r.id) {
        const sessionMatch = webRtcSessions.find(s => s.id === r.id);
        if (sessionMatch) {
          remoteAddress = sessionMatch.remoteAddr || sessionMatch.remoteAddress || null;
        } else if (metricsData) {
          const metricSession = metricsData.webRtcSessions.find(s => s.id === r.id);
          if (metricSession) remoteAddress = metricSession.remoteAddr || null;
        }
      }
      return {
        type: String(r.type || 'unknown'),
        id: String(r.id || ''),
        remoteAddress
      };
    });

    // 3. Media Tracks Parsing
    const tracksArray = Array.isArray(rawPath.tracks) ? rawPath.tracks : [];
    const tracks2Array = Array.isArray(rawPath.tracks2) ? rawPath.tracks2 : [];

    let videoCodec: string | null = null;
    let videoWidth: number | null = null;
    let videoHeight: number | null = null;
    let videoProfile: string | null = null;
    let videoLevel: string | null = null;

    let audioCodec: string | null = null;
    let audioSampleRate: number | null = null;
    let audioChannels: number | null = null;

    for (const t of tracks2Array) {
      if (!t) continue;
      const codecName = String(t.codec || '');
      const props = t.codecProps || {};

      if (
        codecName.startsWith('H26') ||
        codecName.includes('AV1') ||
        codecName.includes('VP') ||
        props.width !== undefined
      ) {
        videoCodec = codecName || videoCodec;
        videoWidth = typeof props.width === 'number' ? props.width : null;
        videoHeight = typeof props.height === 'number' ? props.height : null;
        videoProfile = props.profile ? String(props.profile) : null;
        videoLevel = props.level ? String(props.level) : null;
      } else if (
        codecName.includes('Audio') ||
        codecName.includes('AAC') ||
        codecName.includes('Opus') ||
        props.sampleRate !== undefined
      ) {
        audioCodec = codecName || audioCodec;
        audioSampleRate = typeof props.sampleRate === 'number' ? props.sampleRate : null;
        audioChannels =
          typeof props.channelCount === 'number'
            ? props.channelCount
            : typeof props.channels === 'number'
            ? props.channels
            : null;
      }
    }

    if (!videoCodec && tracksArray.some(t => String(t).toUpperCase().includes('H264'))) {
      videoCodec = 'H264';
    }
    if (!audioCodec && tracksArray.some(t => String(t).toUpperCase().includes('AUDIO') || String(t).toUpperCase().includes('AAC'))) {
      audioCodec = 'MPEG-4 Audio';
    }

    // 4. Inbound / Outbound Bytes & Bitrate Calculation Source Selection
    let selectedMetricSource: 'prometheus' | 'control-api' | 'none' = 'none';
    let inboundBytes: number | null = null;

    if (metricsData?.pathInboundBytes.has(pathName)) {
      inboundBytes = metricsData.pathInboundBytes.get(pathName)!;
      selectedMetricSource = 'prometheus';
    } else if (typeof rawPath.inboundBytes === 'number') {
      inboundBytes = rawPath.inboundBytes;
      selectedMetricSource = 'control-api';
    } else if (typeof rawPath.bytesReceived === 'number' && rawPath.bytesReceived > 0) {
      inboundBytes = rawPath.bytesReceived;
      selectedMetricSource = 'control-api';
    }

    let outboundBytes: number | null =
      typeof rawPath.outboundBytes === 'number' ? rawPath.outboundBytes : null;
    if (outboundBytes === null && metricsData?.pathOutboundBytes.has(pathName)) {
      outboundBytes = metricsData.pathOutboundBytes.get(pathName)!;
    }

    let inboundFramesInError: number | null =
      typeof rawPath.inboundFramesInError === 'number' ? rawPath.inboundFramesInError : null;
    if (inboundFramesInError === null && metricsData?.pathInboundFramesInError.has(pathName)) {
      inboundFramesInError = metricsData.pathInboundFramesInError.get(pathName)!;
    }

    let instantBitrateKbps: number | null = null;
    let smoothedBitrateKbps: number | null = null;
    let averageBitrateKbps60s: number | null = null;
    let peakBitrateKbps60s: number | null = null;
    const configuredTargetBitrateKbps: number = 6000;
    let state: TelemetryState = 'OFFLINE';
    let transportHealth: 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'UNKNOWN' = 'UNKNOWN';

    if (!publisherConnected || !isReady) {
      // Disconnected publisher or unready path clears baseline & history
      this.clearByteSample(pathName);
      instantBitrateKbps = null;
      smoothedBitrateKbps = null;
      averageBitrateKbps60s = null;
      peakBitrateKbps60s = null;
      state = 'OFFLINE';
      transportHealth = 'UNKNOWN';

      this.pathDiagnostics.set(pathName, {
        currentBytes: inboundBytes,
        previousBytes: null,
        deltaBytes: null,
        elapsedMs: null,
        bitrateBps: null,
        bitrateKbps: null,
        smoothedBitrateKbps: null,
        selectedMetricSource,
        sampledAt: new Date(nowMs).toISOString()
      });
    } else {
      const currentBytes = inboundBytes ?? 0;
      const prev = this.byteSamples.get(pathName);

      if (!prev) {
        // First sample baseline establishment -> state is WARMING_UP
        this.byteSamples.set(pathName, {
          bytes: currentBytes,
          sampledAtMonotonicMs: currentMonotonicMs,
          metricSource: selectedMetricSource
        });
        instantBitrateKbps = null;
        smoothedBitrateKbps = null;
        averageBitrateKbps60s = null;
        peakBitrateKbps60s = null;
        state = 'WARMING_UP';
        transportHealth = (inboundFramesInError ?? 0) > 0 ? 'DEGRADED' : 'HEALTHY';

        this.pathDiagnostics.set(pathName, {
          currentBytes,
          previousBytes: null,
          deltaBytes: null,
          elapsedMs: null,
          bitrateBps: null,
          bitrateKbps: null,
          smoothedBitrateKbps: null,
          selectedMetricSource,
          sampledAt: new Date(nowMs).toISOString()
        });
      } else {
        const elapsedMs = currentMonotonicMs - prev.sampledAtMonotonicMs;
        const elapsedSeconds = elapsedMs / 1000;
        const deltaBytes = currentBytes - prev.bytes;

        if (deltaBytes < 0 || elapsedSeconds <= 0) {
          // Counter reset or negative delta or non-positive elapsed time -> reset baseline
          this.byteSamples.set(pathName, {
            bytes: currentBytes,
            sampledAtMonotonicMs: currentMonotonicMs,
            metricSource: selectedMetricSource
          });
          instantBitrateKbps = null;
          smoothedBitrateKbps = null;
          averageBitrateKbps60s = null;
          peakBitrateKbps60s = null;
          state = 'WARMING_UP';
          transportHealth = (inboundFramesInError ?? 0) > 0 ? 'DEGRADED' : 'HEALTHY';

          this.pathDiagnostics.set(pathName, {
            currentBytes,
            previousBytes: prev.bytes,
            deltaBytes,
            elapsedMs,
            bitrateBps: null,
            bitrateKbps: null,
            smoothedBitrateKbps: null,
            selectedMetricSource,
            sampledAt: new Date(nowMs).toISOString()
          });
        } else {
          // Valid delta over positive time -> calculate exact instant bitrate
          const bitrateBps = (deltaBytes * 8) / elapsedSeconds;
          instantBitrateKbps = Math.round(bitrateBps / 1000);
          this.byteSamples.set(pathName, {
            bytes: currentBytes,
            sampledAtMonotonicMs: currentMonotonicMs,
            metricSource: selectedMetricSource
          });
          state = 'LIVE';

          // Transport health: error frames indicate degradation/error
          if ((inboundFramesInError ?? 0) > 10) {
            transportHealth = 'ERROR';
          } else if ((inboundFramesInError ?? 0) > 0) {
            transportHealth = 'DEGRADED';
          } else {
            transportHealth = 'HEALTHY';
          }

          // EMA Smoothing (alpha = 0.25) & 60s rolling window
          let history = this.pathBitrateHistory.get(pathName);
          if (!history) {
            history = { smoothedBitrate: null, samples: [] };
            this.pathBitrateHistory.set(pathName, history);
          }

          if (history.smoothedBitrate === null) {
            smoothedBitrateKbps = instantBitrateKbps;
          } else {
            // EMA formula: smoothed = Math.round(0.25 * instant + 0.75 * prevSmoothed)
            smoothedBitrateKbps = Math.round(0.25 * instantBitrateKbps + 0.75 * history.smoothedBitrate);
          }
          history.smoothedBitrate = smoothedBitrateKbps;

          // Push to 60s window
          history.samples.push({ kbps: instantBitrateKbps, timestampMs: nowMs });
          // Evict older than 60 seconds
          const cutoffMs = nowMs - 60000;
          history.samples = history.samples.filter(s => s.timestampMs >= cutoffMs);

          if (history.samples.length > 0) {
            const sum = history.samples.reduce((acc, s) => acc + s.kbps, 0);
            averageBitrateKbps60s = Math.round(sum / history.samples.length);
            peakBitrateKbps60s = Math.max(...history.samples.map(s => s.kbps));
          } else {
            averageBitrateKbps60s = instantBitrateKbps;
            peakBitrateKbps60s = instantBitrateKbps;
          }

          this.pathDiagnostics.set(pathName, {
            currentBytes,
            previousBytes: prev.bytes,
            deltaBytes,
            elapsedMs,
            bitrateBps,
            bitrateKbps: instantBitrateKbps,
            smoothedBitrateKbps,
            selectedMetricSource,
            sampledAt: new Date(nowMs).toISOString()
          });
        }
      }
    }

    // 5. Compliance Evaluation
    const complianceMode = (process.env.BITRATE_COMPLIANCE_MODE || 'informational').toLowerCase() as 'disabled' | 'informational' | 'strict';
    const targetLowPct = parseFloat(process.env.BITRATE_TARGET_LOW_PERCENT || '80');
    const targetHighPct = parseFloat(process.env.BITRATE_TARGET_HIGH_PERCENT || '120');

    const primaryBitrateForCompliance = smoothedBitrateKbps ?? instantBitrateKbps;

    let compliance: BitrateCompliance;
    if (!publisherConnected || state !== 'LIVE' || primaryBitrateForCompliance === null) {
      compliance = {
        mode: complianceMode,
        status: 'NOT_EVALUATED',
        label: 'Not evaluated'
      };
    } else if (complianceMode === 'disabled') {
      compliance = {
        mode: 'disabled',
        status: 'NOT_EVALUATED',
        label: 'Disabled'
      };
    } else if (complianceMode === 'informational') {
      compliance = {
        mode: 'informational',
        status: 'NOT_EVALUATED',
        label: 'Informational only'
      };
    } else {
      // strict mode
      const lowThresh = configuredTargetBitrateKbps * (targetLowPct / 100);
      const highThresh = configuredTargetBitrateKbps * (targetHighPct / 100);

      if (primaryBitrateForCompliance < lowThresh) {
        compliance = {
          mode: 'strict',
          status: 'BELOW_TARGET_RANGE',
          label: 'Below target range'
        };
      } else if (primaryBitrateForCompliance > highThresh) {
        compliance = {
          mode: 'strict',
          status: 'ABOVE_TARGET_RANGE',
          label: 'Above target range'
        };
      } else {
        compliance = {
          mode: 'strict',
          status: 'WITHIN_TARGET_RANGE',
          label: 'Within target range'
        };
      }
    }

    const isoSampledAt = new Date(nowMs).toISOString();

    return {
      snapshotId: `snap_${this.collectorSequence}_${pathName}_${nowMs}`,
      collectorSequence: this.collectorSequence,
      sourceRevision: 1,
      path: pathName,
      stream: {
        configured: true,
        ready: isReady,
        available: isAvailable,
        online: isOnline,
        state,
        transportHealth,
        readyTime: rawPath.readyTime || null,
        onlineTime: rawPath.onlineTime || null
      },
      publisher: {
        connected: publisherConnected,
        type: pubType,
        protocol: pubType ? pubType.toUpperCase() : null,
        sourceType: pubSourceType,
        id: pubId,
        remoteAddress: pubRemoteAddr
      },
      readers: {
        count: readerItems.length,
        items: readerItems
      },
      media: {
        tracks: tracksArray,
        video: {
          codec: videoCodec,
          width: videoWidth,
          height: videoHeight,
          profile: videoProfile,
          level: videoLevel
        },
        audio: {
          codec: audioCodec,
          sampleRate: audioSampleRate,
          channels: audioChannels
        }
      },
      telemetry: {
        measuredBitrateKbps: smoothedBitrateKbps ?? instantBitrateKbps,
        instantBitrateKbps,
        smoothedBitrateKbps,
        averageBitrateKbps60s,
        peakBitrateKbps60s,
        configuredTargetBitrateKbps,
        inboundBytes,
        outboundBytes,
        inboundFramesInError,
        sampledAt: isoSampledAt,
        freshness: 'live',
        compliance
      }
    };
  }

  /**
   * Main collector method to poll MediaMTX endpoints and produce NormalizedStreamSnapshot[]
   */
  public async collectNormalizedSnapshots(): Promise<{
    items: NormalizedStreamSnapshot[];
    sampledAt: string;
    mediaMtxReachable: boolean;
  }> {
    this.collectorSequence++;
    const sampledAt = new Date().toISOString();
    const nowMs = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);

      const pathsRes = await fetch(`${this.controlApiUrl}/v3/paths/list`, { signal: controller.signal })
        .catch(() => null);

      if (!pathsRes || !pathsRes.ok) {
        clearTimeout(timeout);
        return {
          items: [],
          sampledAt,
          mediaMtxReachable: false
        };
      }

      const pathsData = await pathsRes.json().catch(() => null);
      clearTimeout(timeout);

      if (!pathsData) {
        return {
          items: [],
          sampledAt,
          mediaMtxReachable: false
        };
      }

      const rawPathsList: any[] = Array.isArray(pathsData)
        ? pathsData
        : Array.isArray(pathsData.items)
        ? pathsData.items
        : [];

      // Fetch RTMP conns, WebRTC sessions, and Metrics in parallel
      const [rtmpRes, webrtcRes, metricsRes] = await Promise.all([
        fetch(`${this.controlApiUrl}/v3/rtmpconns/list`, { signal: AbortSignal.timeout(1000) }).catch(() => null),
        fetch(`${this.controlApiUrl}/v3/webrtcsessions/list`, { signal: AbortSignal.timeout(1000) }).catch(() => null),
        fetch(this.metricsUrl, { signal: AbortSignal.timeout(1000) }).catch(() => null)
      ]);

      const rtmpData = rtmpRes?.ok ? await rtmpRes.json().catch(() => null) : null;
      const webrtcData = webrtcRes?.ok ? await webrtcRes.json().catch(() => null) : null;
      const metricsText = metricsRes?.ok ? await metricsRes.text().catch(() => null) : null;

      const rtmpConns = Array.isArray(rtmpData) ? rtmpData : Array.isArray(rtmpData?.items) ? rtmpData.items : [];
      const webRtcSessions = Array.isArray(webrtcData) ? webrtcData : Array.isArray(webrtcData?.items) ? webrtcData.items : [];
      const metricsParsed = metricsText ? this.parseMetrics(metricsText) : undefined;

      const items = rawPathsList.map(rawPath =>
        this.normalizePathSnapshot(
          rawPath,
          {
            rtmpConns,
            webRtcSessions,
            metricsData: metricsParsed
          },
          nowMs
        )
      );

      return {
        items,
        sampledAt,
        mediaMtxReachable: true
      };
    } catch (err) {
      return {
        items: [],
        sampledAt,
        mediaMtxReachable: false
      };
    }
  }

  /**
   * Diagnostic summary generator for GET /api/v1/debug/mediamtx-normalized
   */
  public generateDiagnostics(
    pathName: string,
    rawPathFound: boolean,
    rawPublisherFound: boolean,
    rawReaderCount: number,
    normalized: NormalizedStreamSnapshot | null
  ) {
    const diag = this.pathDiagnostics.get(pathName) || {
      currentBytes: normalized?.telemetry.inboundBytes ?? null,
      previousBytes: null,
      deltaBytes: null,
      elapsedMs: null,
      bitrateBps: null,
      bitrateKbps: normalized?.telemetry.measuredBitrateKbps ?? null,
      selectedMetricSource: 'none',
      sampledAt: new Date().toISOString()
    };

    return {
      rawPathFound,
      rawPublisherFound,
      rawReaderCount,
      byteBaselineReady: this.byteSamples.has(pathName),
      calculationDiagnostics: diag,
      normalized,
      collectorSequence: this.collectorSequence,
      sampledAt: new Date().toISOString()
    };
  }
}
