import {releaseMetadata} from "../generated/releaseMetadata";
import {getRuntimeCodeSource} from "./runtimeCodeSource";

export interface ClientVersionClaim {
  appVersion: string;
  sourceFingerprint: string;
  runtimeKind: string;
  runtimeLabel: string;
  runtimeCid?: string;
}

export function getClientVersionClaim(): ClientVersionClaim {
  const runtime = getRuntimeCodeSource();
  return {
    appVersion: releaseMetadata.appVersion,
    sourceFingerprint: releaseMetadata.sourceFingerprint,
    runtimeKind: runtime.kind,
    runtimeLabel: runtime.label,
    ...(runtime.kind === 'ipfs' ? { runtimeCid: runtime.cid } : {}),
  };
}
