export const samplePathDataLiveTest = {
  name: "live/test",
  confName: "all_others",
  ready: true,
  available: true,
  online: true,
  source: {
    type: "rtmpConn",
    id: "c90880f2-7696-43f1-b04e-acc76b1e956e"
  },
  tracks: [
    "H264",
    "MPEG-4 Audio"
  ],
  tracks2: [
    {
      codec: "H264",
      codecProps: {
        width: 1920,
        height: 1080,
        profile: "Baseline",
        level: "4.2"
      }
    },
    {
      codec: "MPEG-4 Audio",
      codecProps: {
        sampleRate: 48000,
        channelCount: 2
      }
    }
  ],
  readers: [
    {
      type: "webRTCSession",
      id: "14cdd1c1-86ba-41ae-a200-b0f29d21a38c"
    }
  ],
  inboundBytes: 17280033,
  outboundBytes: 13402623,
  inboundFramesInError: 0
};

export const sampleRtmpConnsList = {
  items: [
    {
      id: "c90880f2-7696-43f1-b04e-acc76b1e956e",
      path: "live/test",
      remoteAddr: "127.0.0.1:51406",
      state: "publish"
    }
  ]
};

export const sampleWebRtcSessionsList = {
  items: [
    {
      id: "14cdd1c1-86ba-41ae-a200-b0f29d21a38c",
      path: "live/test",
      remoteAddr: "127.0.0.1:52355",
      state: "read"
    }
  ]
};

export const sampleMetricsText = `
paths{name="live/test",state="ready"} 1
paths_readers{name="live/test",readerType="webRTCSession",state="ready"} 1
paths_inbound_bytes{name="live/test",state="ready"} 17847013
paths_outbound_bytes{name="live/test",state="ready"} 13849482
paths_inbound_frames_in_error{name="live/test",state="ready"} 0

rtmp_conns{id="c90880f2-7696-43f1-b04e-acc76b1e956e",path="live/test",remoteAddr="127.0.0.1:51406",state="publish"} 1
rtmp_conns_inbound_bytes{id="c90880f2-7696-43f1-b04e-acc76b1e956e",path="live/test",remoteAddr="127.0.0.1:51406",state="publish"} 17696062

webrtc_sessions{id="14cdd1c1-86ba-41ae-a200-b0f29d21a38c",path="live/test",remoteAddr="127.0.0.1:52355",state="read"} 1
webrtc_sessions_outbound_bytes{id="14cdd1c1-86ba-41ae-a200-b0f29d21a38c",path="live/test",remoteAddr="127.0.0.1:52355",state="read"} 14101927
`.trim();
