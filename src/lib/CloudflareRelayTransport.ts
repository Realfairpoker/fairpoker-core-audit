import type {
  Transport,
  TransportEventName,
  TransportEvents,
} from 'dandelion-mesh';

type RelayTransportOptions = {
  serverUrl: string;
  roomId: string;
  peerId: string;
  authToken?: string;
};

export type RelayPeerProfile = {
  peerId: string;
  connectedAt: number;
  source: string;
  browser: string;
  os: string;
  device: string;
  platform: string;
  language: string;
  timezone: string;
  country: string;
  screenBucket: string;
  hardware: string;
  ipSegment: string;
  networkFingerprint: string;
  ipConfidence: string;
  clientFingerprint: string;
};

type RelayServerMessage =
  | { type: 'welcome'; roomId: string; peerId: string; peers: string[]; profile?: RelayPeerProfile; profiles?: RelayPeerProfile[]; roomRisk?: unknown }
  | { type: 'peerJoined'; peerId: string; profile?: RelayPeerProfile; roomRisk?: unknown }
  | { type: 'peerLeft'; peerId: string }
  | { type: 'riskUpdate'; roomRisk?: unknown }
  | { type: 'message'; from: string; data: unknown }
  | { type: 'error'; message: string };

function bucketNumber(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 'unknown';
  }
  return String(Math.round(value / step) * step);
}

function getClientDeviceClass() {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && Math.min(window.screen.width, window.screen.height) < 700) {
    return 'mobile';
  }
  if (coarse) {
    return 'tablet';
  }
  return 'desktop';
}

function appendClientHints(url: URL) {
  if (typeof window === 'undefined') {
    return;
  }
  const navigatorLike = window.navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
  };
  url.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown');
  url.searchParams.set('lang', navigator.language || 'unknown');
  url.searchParams.set('platform', navigatorLike.userAgentData?.platform || navigator.platform || 'unknown');
  url.searchParams.set('device', getClientDeviceClass());
  url.searchParams.set('screen', `${bucketNumber(window.screen.width, 100)}x${bucketNumber(window.screen.height, 100)}`);
  url.searchParams.set('hw', `${navigator.hardwareConcurrency || 'unknown'}c-${navigatorLike.deviceMemory || 'unknown'}m`);
}

function buildWebSocketUrl(serverUrl: string, roomId: string, peerId: string, authToken?: string) {
  const url = new URL(serverUrl);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  }

  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/room/${encodeURIComponent(roomId)}`;
  url.searchParams.set('peerId', peerId);
  if (authToken) {
    url.searchParams.set('token', authToken);
  }
  appendClientHints(url);
  return url.toString();
}

function publishProfiles(profiles: RelayPeerProfile[]) {
  if (typeof window === 'undefined' || profiles.length === 0) {
    return;
  }
  window.dispatchEvent(new CustomEvent('fairpoker:peer-profiles', {
    detail: { profiles },
  }));
}

function publishRoomRisk(roomRisk: unknown) {
  if (typeof window === 'undefined' || !roomRisk) {
    return;
  }
  window.dispatchEvent(new CustomEvent('fairpoker:room-risk', {
    detail: { roomRisk },
  }));
}

export default class CloudflareRelayTransport implements Transport {
  private readonly socket: WebSocket;
  private readonly peerId: string;
  private readonly connected = new Set<string>();
  private readonly listeners: {
    [K in TransportEventName]: Set<TransportEvents[K]>;
  } = {
    open: new Set(),
    peerConnected: new Set(),
    peerDisconnected: new Set(),
    message: new Set(),
    error: new Set(),
    close: new Set(),
  };

  private _localPeerId?: string;

  constructor(options: RelayTransportOptions) {
    this.peerId = options.peerId;
    this.socket = new WebSocket(buildWebSocketUrl(
      options.serverUrl,
      options.roomId,
      options.peerId,
      options.authToken,
    ));

    this.socket.addEventListener('message', (event) => {
      this.handleServerMessage(event.data);
    });
    this.socket.addEventListener('error', () => {
      this.emit('error', new Error('Cloudflare relay WebSocket error.'));
    });
    this.socket.addEventListener('close', () => {
      this.connected.clear();
      this.emit('close');
    });
  }

  get localPeerId() {
    return this._localPeerId;
  }

  get connectedPeers() {
    return Array.from(this.connected);
  }

  connect(remotePeerId: string) {
    if (remotePeerId === this.peerId || this.connected.has(remotePeerId)) {
      return;
    }
    this.sendControl({ type: 'connect', peerId: remotePeerId });
  }

  async send(remotePeerId: string, data: unknown) {
    this.sendControl({
      type: 'send',
      to: remotePeerId,
      data,
    });
  }

  async broadcast(data: unknown) {
    this.sendControl({
      type: 'broadcast',
      data,
    });
  }

  on<E extends TransportEventName>(event: E, listener: TransportEvents[E]) {
    this.listeners[event].add(listener);
  }

  off<E extends TransportEventName>(event: E, listener: TransportEvents[E]) {
    this.listeners[event].delete(listener);
  }

  close() {
    this.socket.close();
  }

  private handleServerMessage(raw: unknown) {
    let message: RelayServerMessage;
    try {
      message = JSON.parse(String(raw));
    } catch {
      this.emit('error', new Error('Cloudflare relay sent invalid JSON.'));
      return;
    }

    if (message.type === 'welcome') {
      this._localPeerId = message.peerId;
      publishProfiles([
        ...(message.profile ? [message.profile] : []),
        ...(message.profiles ?? []),
      ]);
      publishRoomRisk(message.roomRisk);
      for (const peerId of message.peers) {
        if (peerId !== this.peerId) {
          this.connected.add(peerId);
        }
      }
      this.emit('open', message.peerId);
      queueMicrotask(() => {
        for (const peerId of Array.from(this.connected)) {
          this.emit('peerConnected', peerId);
        }
      });
      return;
    }

    if (message.type === 'peerJoined') {
      publishProfiles(message.profile ? [message.profile] : []);
      publishRoomRisk(message.roomRisk);
      if (message.peerId !== this.peerId && !this.connected.has(message.peerId)) {
        this.connected.add(message.peerId);
        this.emit('peerConnected', message.peerId);
      }
      return;
    }

    if (message.type === 'peerLeft') {
      if (this.connected.delete(message.peerId)) {
        this.emit('peerDisconnected', message.peerId);
      }
      return;
    }

    if (message.type === 'riskUpdate') {
      publishRoomRisk(message.roomRisk);
      return;
    }

    if (message.type === 'message') {
      if (message.from !== this.peerId) {
        this.connected.add(message.from);
        this.emit('message', message.from, message.data);
      }
      return;
    }

    this.emit('error', new Error(message.message));
  }

  private sendControl(message: unknown) {
    const encoded = JSON.stringify(message);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(encoded);
      return;
    }
    this.socket.addEventListener('open', () => this.socket.send(encoded), { once: true });
  }

  private emit<E extends TransportEventName>(
    event: E,
    ...args: Parameters<TransportEvents[E]>
  ) {
    for (const listener of Array.from(this.listeners[event])) {
      (listener as (...args: Parameters<TransportEvents[E]>) => void)(...args);
    }
  }
}
