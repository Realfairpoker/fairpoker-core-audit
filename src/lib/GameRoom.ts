import EventEmitter from "eventemitter3";
import Deferred from "./Deferred";
import {EventListener} from "./types";
import {
  EventSigner,
  isSignedGameEvent,
  SignedGameEvent,
  verifySignedGameEvent,
} from "./fairness/eventSigning";
import {
  TranscriptEntry,
  TranscriptRecorder,
  TranscriptSnapshot,
} from "./fairness/transcript";

export type GameRoomStatus =
  | 'NotReady'
  | 'PeerServerConnected'
  | 'HostConnected'
  | 'Closed'
;

export interface PublicGameEvent<T> {
  type: 'public';
  sender: string;
  data: T;
}

export interface PrivateGameEvent<T> {
  type: 'private';
  sender: string;
  recipient: string;
  data: T;
}

export type GameEvent<T> = PublicGameEvent<T> | PrivateGameEvent<T>;
export type WireGameEvent<T> = T | SignedGameEvent<T>;

export interface GameRoomEvents<T> {
  status: (status: GameRoomStatus) => void;
  connected: (peerId: string) => void;
  members: (members: string[]) => void;
  event: (e: T, fromWhom: string, replay?: boolean) => void;
  transcript: (entry: TranscriptEntry<unknown>) => void;
}

export type GameRoomOptions = {
  hostId?: string;
  eventSigner?: EventSigner;
  /**
   * Security default: Fair Poker v0 table traffic rejects unsigned wire events.
   * Tests or legacy local simulations must opt out explicitly.
   */
  rejectUnsignedEvents?: boolean;
}

/**
 * Minimal interface for the mesh network that GameRoom depends on.
 * This matches the public API of DandelionMesh.
 */
export interface MeshLike<T> {
  readonly peerId: string | undefined;
  readonly peers: string[];
  readonly leaderId: string | null;
  sendPublic(data: T): Promise<boolean>;
  sendPrivate(recipientPeerId: string, data: T): Promise<boolean>;
  on(event: 'ready', listener: (localPeerId: string) => void): void;
  on(event: 'message', listener: (message: { type: 'public'; sender: string; data: T } | { type: 'private'; sender: string; recipient: string; data: T }, replay: boolean) => void): void;
  on(event: 'peersChanged', listener: (peers: string[]) => void): void;
  on(event: 'leaderChanged', listener: (leaderId: string | null) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  close(): void;
}

export default class GameRoom<T> {
  private readonly emitter = new EventEmitter<GameRoomEvents<GameEvent<T>>>();
  private readonly mesh: MeshLike<WireGameEvent<T>>;
  private readonly eventSigner?: EventSigner;
  private readonly rejectUnsignedEvents: boolean;
  private readonly transcript = new TranscriptRecorder<T>();

  private _status: GameRoomStatus = 'NotReady';

  public peerId?: string;
  private peerIdDeferred = new Deferred<string>();
  private leaderDeferred: Deferred<void> | null = new Deferred<void>();

  public readonly hostId?: string;

  constructor(mesh: MeshLike<WireGameEvent<T>> | MeshLike<T>, options?: GameRoomOptions) {
    this.hostId = options?.hostId;
    this.mesh = mesh as MeshLike<WireGameEvent<T>>;
    this.eventSigner = options?.eventSigner;
    this.rejectUnsignedEvents = options?.rejectUnsignedEvents ?? true;

    this.mesh.on('ready', (peerId: string) => {
      console.debug(`Connected to the signaling service. (peerId = ${peerId}).`);
      this.peerId = peerId;
      this.peerIdDeferred.resolve(peerId);
      this._status = 'PeerServerConnected';
      this.emitter.emit('status', this._status);
      this.emitter.emit('connected', peerId);

      if (!this.hostId) {
        // Room creator: emit initial members (just self)
        this.emitter.emit('members', this.members);
      }
    });

    this.mesh.on('peersChanged', (_peers: string[]) => {
      // For joiners, transition to HostConnected when connected to a peer
      if (this.hostId && this._status === 'PeerServerConnected') {
        this._status = 'HostConnected';
        this.emitter.emit('status', this._status);
      }
      this.emitter.emit('members', this.members);
    });

    this.mesh.on('leaderChanged', (leaderId: string | null) => {
      console.debug(`[GameRoom] leaderChanged: ${leaderId} (my peerId: ${this.peerId})`);
      if (leaderId) {
        if (this.leaderDeferred) {
          this.leaderDeferred.resolve();
          this.leaderDeferred = null;
        }
      } else {
        // Leader lost (e.g., during Raft re-election after cluster merge).
        // Create a new deferred so waitForLeader blocks until a new leader is elected.
        if (!this.leaderDeferred) {
          this.leaderDeferred = new Deferred<void>();
        }
      }
    });

    this.mesh.on('message', (msg, replay) => {
      void this.handleMeshMessage(msg, replay);
    });
  }

  private async handleMeshMessage(
    msg: { type: 'public'; sender: string; data: WireGameEvent<T> } | { type: 'private'; sender: string; recipient: string; data: WireGameEvent<T> },
    replay: boolean,
  ) {
    const decoded = await this.decodeWireEvent(msg.data, msg.sender);
    if (!decoded) {
      return;
    }

    const transcriptEntry = await this.transcript.append({
      transportSender: msg.sender,
      scope: msg.type,
      ...(msg.type === 'private' ? { recipient: msg.recipient } : {}),
      wireEvent: msg.data,
    });
    this.emitter.emit('transcript', transcriptEntry as TranscriptEntry<unknown>);

    let gameEvent: GameEvent<T>;
    if (msg.type === 'public') {
      gameEvent = { type: 'public', sender: decoded.sender, data: decoded.payload };
    } else {
      gameEvent = { type: 'private', sender: decoded.sender, recipient: msg.recipient, data: decoded.payload };
    }
    console.debug(`[GameRoom] received ${msg.type} message from ${decoded.sender}, replay=${replay}, dataType=${(decoded.payload as any)?.type}`);
    try {
      this.emitter.emit('event', gameEvent, decoded.sender, replay);
    } catch (e) {
      console.error(`[GameRoom] ERROR in event handler for ${(decoded.payload as any)?.type}:`, e);
    }
  }

  private async decodeWireEvent(data: WireGameEvent<T>, transportSender: string): Promise<{
    sender: string;
    payload: T;
  } | null> {
    if (!isSignedGameEvent<T>(data)) {
      if (this.rejectUnsignedEvents) {
        console.warn('[GameRoom] rejected unsigned event.');
        return null;
      }
      return {
        sender: transportSender,
        payload: data,
      };
    }

    const verification = await verifySignedGameEvent(data, transportSender);
    if (!verification.ok) {
      console.warn(`[GameRoom] rejected invalid signed event: ${verification.reason}`);
      return null;
    }

    return {
      sender: data.sender,
      payload: data.payload,
    };
  }

  close() {
    this._status = 'Closed';
    this.emitter.emit('status', this._status);
    this.mesh.close();
  }

  get status() {
    return this._status;
  }

  get members() {
    return this.mesh.peers;
  }

  /**
   * Waits for the Raft leader to be elected before sending.
   * This ensures messages are not silently dropped during leader election.
   */
  private async waitForLeader(): Promise<void> {
    if (this.mesh.leaderId) return;
    if (this.leaderDeferred) {
      await this.leaderDeferred.promise;
    }
  }

  private async sendWithRetry(send: () => Promise<boolean>, label: string): Promise<void> {
    const MAX_RETRIES = 50;
    const RETRY_DELAY_MS = 200;
    for (let i = 0; i < MAX_RETRIES; i++) {
      await this.waitForLeader();
      console.debug(`sendWithRetry (${label}): calling send (attempt ${i + 1}/${MAX_RETRIES})...`);
      const result = await send();
      console.debug(`sendWithRetry (${label}): send returned ${result}`);
      if (result) return;
      if (i === 0 || i % 10 === 0) {
        console.debug(`emitEvent (${label}): send returned false (attempt ${i + 1}/${MAX_RETRIES}), leaderId=${this.mesh.leaderId}, peers=${this.mesh.peers.join(',')}`);
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
    console.warn(`emitEvent (${label}): max retries exceeded, message may be lost.`);
  }

  async emitEvent(e: GameEvent<T>) {
    if (e.type === 'public') {
      await this.sendWithRetry(async () => this.mesh.sendPublic(await this.encodeWireEvent(e)), 'public');
    } else {
      await this.sendWithRetry(async () => this.mesh.sendPrivate(e.recipient, await this.encodeWireEvent(e)), `private→${e.recipient}`);
    }
  }

  private async encodeWireEvent(e: GameEvent<T>): Promise<WireGameEvent<T>> {
    if (!this.eventSigner) {
      if (this.rejectUnsignedEvents) {
        throw new Error('Cannot emit unsigned Fair Poker event while rejectUnsignedEvents is enabled.');
      }
      return e.data;
    }

    return this.eventSigner.sign({
      sender: await this.peerIdAsync,
      scope: e.type,
      ...(e.type === 'private' ? { recipient: e.recipient } : {}),
      payload: e.data,
    });
  }

  getTranscript(): TranscriptSnapshot<T> {
    return this.transcript.snapshot();
  }

  onEvent(handler: (e: GameEvent<T>, fromWhom: string) => void) {
    this.emitter.on('event', handler);
  }

  offEvent(handler?: (e: GameEvent<T>, fromWhom: string) => void) {
    this.emitter.off('event', handler);
  }

  get peerIdAsync() {
    return this.peerIdDeferred.promise;
  }

  get listener(): EventListener<GameRoomEvents<GameEvent<T>>> {
    return this.emitter;
  }
}
