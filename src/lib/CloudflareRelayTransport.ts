import type {
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
  accountId?: string | null;
  accountUsername?: string | null;
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
  | { type: 'welcome'; roomId: string; peerId: string; peers: string[]; profile?: RelayPeerProfile; profiles?: RelayPeerProfile[]; relay?: RelaySummary; roomRisk?: unknown; roomState?: WorkerRoomState; capabilities?: RelayCapabilities }
  | { type: 'peerJoined'; peerId: string; profile?: RelayPeerProfile; roomRisk?: unknown }
  | { type: 'peerLeft'; peerId: string }
  | { type: 'riskUpdate'; roomRisk?: unknown }
  | { type: 'roomState'; roomState?: WorkerRoomState }
  | { type: 'message'; from: string; seq?: number; replay?: boolean; data: unknown }
  | { type: 'error'; message: string };

type RelaySummary = {
  latestSeq: number;
  retainedFromSeq: number;
  retainedCount: number;
  maxRetainedCount: number;
};

type RelayCapabilities = {
  publicSelfEcho?: boolean;
  orderedEventLog?: boolean;
};

const liveRelaySeqByRoomAndPeer = new Map<string, number>();

export type WorkerPlayerStatus = 'active' | 'watching' | 'sittingOut' | 'timedOut' | 'offline';

export type WorkerRoomPlayerState = {
  peerId: string;
  online: boolean;
  connected: boolean;
  seated: boolean;
  spectator?: boolean;
  status: WorkerPlayerStatus;
  timedOut?: boolean;
  sittingOut?: boolean;
};

export type WorkerRoomState = {
  version: number;
  source: 'cloudflare-worker';
  roomId: string;
  generatedAt: number;
  viewerPeerId?: string;
  latestEventSeq: number;
  currentRound: number | null;
  currentPlayers: string[];
  currentTurn: string | null;
  players: WorkerRoomPlayerState[];
  spectators?: WorkerRoomPlayerState[];
  activePlayerCount: number;
  spectatorCount?: number;
  onlineCount: number;
  roomValid: boolean;
  playable: boolean;
  reason: string;
};

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

function writeLastRelaySeq(roomId: string, peerId: string, seq: number) {
  if (typeof window === 'undefined' || !Number.isSafeInteger(seq) || seq <= 0) {
    return;
  }
  const previous = readStoredRelaySeq(roomId, peerId);
  const liveKey = relaySeqStorageKey(roomId, peerId);
  liveRelaySeqByRoomAndPeer.set(liveKey, Math.max(liveRelaySeqByRoomAndPeer.get(liveKey) ?? 0, seq));
  if (seq <= previous) {
    return;
  }
  try {
    window.localStorage.setItem(relaySeqStorageKey(roomId, peerId), String(seq));
  } catch {
    // Reconnect replay is an optimization; storage-denied browsers can still play live.
  }
}

function relaySeqStorageKey(roomId: string, peerId: string) {
  return `fairpoker:relay:${roomId}:${peerId}:lastSeq`;
}

function readStoredRelaySeq(roomId: string, peerId: string) {
  if (typeof window === 'undefined') {
    return 0;
  }
  try {
    const value = Number(window.localStorage.getItem(relaySeqStorageKey(roomId, peerId)) || 0);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function readLiveRelaySeq(roomId: string, peerId: string) {
  return liveRelaySeqByRoomAndPeer.get(relaySeqStorageKey(roomId, peerId)) ?? 0;
}

export const TOKEN_SUBPROTOCOL_PREFIX = 'fairpoker.token.';

// Carries the relay auth token in the WebSocket subprotocol instead of only the
// URL query, so it stays out of proxy/CDN/access logs. Browsers cannot set an
// Authorization header on a WebSocket, so the subprotocol is the available
// channel. The query token is kept for now as a fallback so the connection can
// never break; once verified, the query token can be dropped. (Audit B11.)
export function buildTokenSubprotocols(authToken?: string): string[] | undefined {
  return authToken ? [`${TOKEN_SUBPROTOCOL_PREFIX}${authToken}`] : undefined;
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
  url.searchParams.set('sinceSeq', String(readLiveRelaySeq(roomId, peerId)));
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

function publishRelaySummary(relay: RelaySummary | undefined) {
  if (typeof window === 'undefined' || !relay) {
    return;
  }
  window.dispatchEvent(new CustomEvent('fairpoker:relay-summary', {
    detail: { relay },
  }));
}

function publishRoomState(roomState: WorkerRoomState | undefined) {
  if (typeof window === 'undefined' || !roomState) {
    return;
  }
  const fairPokerWindow = window as Window & {
    __fairPokerLatestRoomStates?: Map<string, WorkerRoomState>;
  };
  if (!fairPokerWindow.__fairPokerLatestRoomStates) {
    fairPokerWindow.__fairPokerLatestRoomStates = new Map();
  }
  fairPokerWindow.__fairPokerLatestRoomStates.set(roomState.roomId, roomState);
  window.dispatchEvent(new CustomEvent('fairpoker:room-state', {
    detail: { roomState },
  }));
}

export default class CloudflareRelayTransport {
  private readonly socket: WebSocket;
  private readonly peerId: string;
  private readonly roomId: string;
  private capabilities: RelayCapabilities = {};
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
    this.roomId = options.roomId;
    this.socket = new WebSocket(buildWebSocketUrl(
      options.serverUrl,
      options.roomId,
      options.peerId,
      options.authToken,
    ), buildTokenSubprotocols(options.authToken));

    this.socket.addEventListener('message', (event) => this.handleServerMessage(event.data));
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
    return this.sendControl({
      type: 'send',
      to: remotePeerId,
      data,
    });
  }

  async broadcast(data: unknown) {
    return this.sendControl({
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

  get publicSelfEcho() {
    return Boolean(this.capabilities.publicSelfEcho);
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
      this.capabilities = message.capabilities ?? {};
      publishRelaySummary(message.relay);
      publishRoomState(message.roomState);
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

    if (message.type === 'roomState') {
      publishRoomState(message.roomState);
      return;
    }

    if (message.type === 'message') {
      if (message.seq) {
        writeLastRelaySeq(this.roomId, this.peerId, message.seq);
      }
      if (message.from !== this.peerId) {
        this.connected.add(message.from);
      }
      this.emitTransportMessage(message.from, message.data, Boolean(message.replay));
      return;
    }

    this.emit('error', new Error(message.message));
  }

  private sendControl(message: unknown): Promise<boolean> {
    const encoded = JSON.stringify(message);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(encoded);
      return Promise.resolve(true);
    }
    if (this.socket.readyState !== WebSocket.CONNECTING) {
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      const cleanup = () => {
        window.clearTimeout(timer);
        this.socket.removeEventListener('open', onOpen);
        this.socket.removeEventListener('close', onClosed);
        this.socket.removeEventListener('error', onClosed);
      };
      const onOpen = () => {
        cleanup();
        try {
          this.socket.send(encoded);
          resolve(true);
        } catch {
          resolve(false);
        }
      };
      const onClosed = () => {
        cleanup();
        resolve(false);
      };
      const timer = window.setTimeout(onClosed, 1500);
      this.socket.addEventListener('open', onOpen, { once: true });
      this.socket.addEventListener('close', onClosed, { once: true });
      this.socket.addEventListener('error', onClosed, { once: true });
    });
  }

  private emit<E extends TransportEventName>(
    event: E,
    ...args: Parameters<TransportEvents[E]>
  ) {
    for (const listener of Array.from(this.listeners[event])) {
      (listener as (...args: Parameters<TransportEvents[E]>) => void)(...args);
    }
  }

  private emitTransportMessage(from: string, data: unknown, replay: boolean) {
    for (const listener of Array.from(this.listeners.message)) {
      (listener as (from: string, data: unknown, replay?: boolean) => void)(from, data, replay);
    }
  }
}
