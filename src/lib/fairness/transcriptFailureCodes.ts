export type TranscriptFailureCode =
  | 'TR-EMPTY'
  | 'TR-INDEX-MISMATCH'
  | 'TR-PREV-HASH-MISMATCH'
  | 'TR-EVENT-HASH-MISMATCH'
  | 'TR-FINAL-HASH-MISMATCH'
  | 'TR-SIGNATURE-VERIFY-FAILED'
  | 'TR-SIGNER-UNAVAILABLE'
  | 'TR-UNKNOWN';

export type SignedEventFailureCode =
  | 'EV-SENDER-MISMATCH'
  | 'EV-PUBLIC-KEY-MISMATCH'
  | 'EV-FINGERPRINT-MISMATCH'
  | 'EV-PAYLOAD-HASH-MISMATCH'
  | 'EV-SIGNATURE-MISMATCH'
  | 'EV-VERIFY-FAILED'
  | 'EV-UNKNOWN';

export type FairnessFailureCode = TranscriptFailureCode | SignedEventFailureCode;

export interface FairnessFailure {
  code: FairnessFailureCode;
  detail: string;
}

const transcriptFailureDetails: Record<TranscriptFailureCode, string> = {
  'TR-EMPTY': 'No transcript entries yet',
  'TR-INDEX-MISMATCH': 'Entry index does not follow sequence',
  'TR-PREV-HASH-MISMATCH': 'Previous hash mismatch in hash chain',
  'TR-EVENT-HASH-MISMATCH': 'Entry hash mismatch',
  'TR-FINAL-HASH-MISMATCH': 'Final hash mismatch',
  'TR-SIGNATURE-VERIFY-FAILED': 'Signed event signature verification failed',
  'TR-SIGNER-UNAVAILABLE': 'Signer verification returned failure',
  'TR-UNKNOWN': 'Transcript verification failed',
};

const signedEventFailureDetails: Record<SignedEventFailureCode, string> = {
  'EV-SENDER-MISMATCH': 'Envelope sender does not match transport sender',
  'EV-PUBLIC-KEY-MISMATCH': 'Signing public key does not match sender identity',
  'EV-FINGERPRINT-MISMATCH': 'Public key fingerprint mismatch',
  'EV-PAYLOAD-HASH-MISMATCH': 'Payload hash mismatch',
  'EV-SIGNATURE-MISMATCH': 'Signature verification failed',
  'EV-VERIFY-FAILED': 'Failed to verify event signature',
  'EV-UNKNOWN': 'Signature verification failed',
};

export function transcriptFailure(code: TranscriptFailureCode, detail?: string): FairnessFailure {
  return {
    code,
    detail: detail ?? transcriptFailureDetails[code],
  };
}

export function signedEventFailure(
  code: SignedEventFailureCode,
  detail?: string,
): {code: SignedEventFailureCode; detail: string} {
  return {
    code,
    detail: detail ?? signedEventFailureDetails[code],
  };
}
