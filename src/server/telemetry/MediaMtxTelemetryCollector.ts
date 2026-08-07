import { NormalizedStreamSnapshot, TelemetryState } from '../../types';

export interface ByteSample {
  bytes: number;
  sampledAtMs: number;
}

export interface MediaMtxCollectorConfig {
  controlApiUrl: string;
  metricsUrl: string;
}

export class MediaMtxTelemetryCollector {
  private byteSamples = new Map<string, ByteSample>();
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
    sampledAtTime?: number | string
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
        // Try RTMP conns list
        const rtmpMatch = rtmpConns.find(
          c => c.id === pubId || c.id === rawPath.source.id
        );
        if (rtmpMatch) {
          pubRemoteAddr = rtmpMatch.remoteAddr || rtmpMatch.remoteAddress || null;
          if (rtmpMatch.state === 'publish' || rtmpMatch.state === 'publishing') {
            publisherConnected = true;
          }
        }

        // Try Metrics RTMP conns
        if (!publisherConnected && metricsData) {
          const metricRtmp = metricsData.rtmpConns.find(c => c.id === pubId);
          if (metricRtmp) {
            pubRemoteAddr = metricRtmp.remoteAddr || null;
            if (metricRtmp.state === 'publish' || metricRtmp.state === 'publishing') {
              publisherConnected = true;
            }
          }
        }

        // Default to connected if path has a valid source ID and ready/online, unless state says otherwise
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

    // 4. Inbound / Outbound Bytes & Bitrate Calculation
    let inboundBytes: number | null =
      typeof rawPath.inboundBytes === 'number' ? rawPath.inboundBytes : null;
    let outboundBytes: number | null =
      typeof rawPath.outboundBytes === 'number' ? rawPath.outboundBytes : null;
    let inboundFramesInError: number | null =
      typeof rawPath.inboundFramesInError === 'number' ? rawPath.inboundFramesInError : null;

    if (inboundBytes === null && metricsData?.pathInboundBytes.has(pathName)) {
      inboundBytes = metricsData.pathInboundBytes.get(pathName)!;
    }
    if (outboundBytes === null && metricsData?.pathOutboundBytes.has(pathName)) {
      outboundBytes = metricsData.pathOutboundBytes.get(pathName)!;
    }
    if (inboundFramesInError === null && metricsData?.pathInboundFramesInError.has(pathName)) {
      inboundFramesInError = metricsData.pathInboundFramesInError.get(pathName)!;
    }

    let measuredBitrateKbps: number | null = null;
    let state: TelemetryState = 'OFFLINE';

    if (!publisherConnected || !isReady) {
      // Clear baseline when publisher is disconnected or path not ready
      this.byteSamples.delete(pathName);
      measuredBitrateKbps = null;
      state = 'OFFLINE';
    } else {
      const currentBytes = inboundBytes ?? 0;
      const prev = this.byteSamples.get(pathName);

      if (!prev) {
        // First valid sample
        this.byteSamples.set(pathName, { bytes: currentBytes, sampledAtMs: nowMs });
        measuredBitrateKbps = null;
        state = 'WARMING_UP';
      } else {
        const elapsedSeconds = (nowMs - prev.sampledAtMs) / 1000;
        const bytesDelta = currentBytes - prev.bytes;

        if (bytesDelta < 0 || elapsedSeconds <= 0) {
          // Negative delta or counter reset or zero time diff
          this.byteSamples.set(pathName, { bytes: currentBytes, sampledAtMs: nowMs });
          measuredBitrateKbps = null;
          state = 'WARMING_UP';
        } else {
          // Second and subsequent valid sample
          measuredBitrateKbps = Math.round(((bytesDelta * 8) / elapsedSeconds) / 1000);
          this.byteSamples.set(pathName, { bytes: currentBytes, sampledAtMs: nowMs });
          state = 'LIVE';
        }
      }
    }

    return {
      path: pathName,
      stream: {
        configured: true,
        ready: isReady,
        available: isAvailable,
        online: isOnline,
        state,
        readyTime: rawPath.readyTime || null,
        onlineTime: rawPath.onlineTime || null
      },
      publisher: {
        connected: publisherConnected,
        type: pubType,
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
        measuredBitrateKbps,
        inboundBytes,
        outboundBytes,
        inboundFramesInError,
        sampledAt: new Date(nowMs).toISOString(),
        freshness: 'live'
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
    return {
      rawPathFound,
      rawPublisherFound,
      rawReaderCount,
      byteBaselineReady: this.byteSamples.has(pathName),
      normalized,
      sampledAt: new Date().toISOString()
    };
  }
}
