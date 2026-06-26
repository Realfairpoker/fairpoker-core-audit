import {FairnessFailureCode} from './transcriptFailureCodes';

export type FairnessFailureCodeGuidance = {
  code: FairnessFailureCode;
  scope: 'transcript' | 'signature';
  severity: 'low' | 'medium' | 'high';
  summary: string;
  impact: string;
  check: string;
};

export const FAIRNESS_FAILURE_CODE_GUIDES: FairnessFailureCodeGuidance[] = [
  {
    code: 'TR-EMPTY',
    scope: 'transcript',
    severity: 'medium',
    summary: 'No transcript entries / transcript 为空',
    impact: '无法验证本局签名与 hash 链，审计证据链不存在。 / Cannot verify signed hash-chain without any transcript events.',
    check: '确认参与者是否进入牌局，刷新后下载到最新 transcript / Ensure players are in game, then reload and download the latest transcript.',
  },
  {
    code: 'TR-INDEX-MISMATCH',
    scope: 'transcript',
    severity: 'high',
    summary: 'Transcript index sequence broken / 事件序号不连续',
    impact: '事件顺序被修改或丢失，哈希链已失真。 / Event order was altered or truncated, hash chain is invalid.',
    check: '下载同一牌局的 transcript 与服务器/对端日志对照，确认是否有重放/过滤。 / Compare transcript with server/peer logs to confirm replay or filtering.',
  },
  {
    code: 'TR-PREV-HASH-MISMATCH',
    scope: 'transcript',
    severity: 'high',
    summary: 'Previous hash mismatch / 上一条哈希不匹配',
    impact: '哈希链断裂：任一事件可能被篡改或遗漏。 / Hash chain break; an event may be tampered or missing.',
    check: '请核对发布的 transcript 文件是否被完整下载并重新复验。 / Verify complete transcript file integrity before re-verifying.',
  },
  {
    code: 'TR-EVENT-HASH-MISMATCH',
    scope: 'transcript',
    severity: 'high',
    summary: 'Event hash mismatch / 事件哈希不一致',
    impact: '事件内容与链上记录不一致，可能是签名或序列化差异。 / Event payload differs from hash-chain record; serialization/signature mismatch may exist.',
    check: '按源码中的 `canonicalJson` 与事件顺序重放；确认同一条日志的导出版本。 / Re-run replay with canonical JSON order and confirm exported log version.',
  },
  {
    code: 'TR-FINAL-HASH-MISMATCH',
    scope: 'transcript',
    severity: 'high',
    summary: 'Final hash mismatch / 最终哈希不一致',
    impact: 'snapshot 与重放结果不一致，不能作为证据锚点。 / Snapshot hash is not the same as replay result, not safe as proof anchor.',
    check: '比较 transcript 最终哈希与证据包内 fingerprint，必要时重打包并保留原始文件。 / Compare final hash and evidence digest; repackage only after collecting original file.',
  },
  {
    code: 'TR-SIGNATURE-VERIFY-FAILED',
    scope: 'signature',
    severity: 'high',
    summary: 'Event signature verification failed / 事件签名校验失败',
    impact: '该事件未通过签名认证，不能信任其内容。 / Event cannot be trusted; signature failed validation.',
    check: '确认发布页代码与 `clientVersion`，对照 `Signing` 链路是否完整。 / Check release/code version and signing pipeline completeness.',
  },
  {
    code: 'TR-SIGNER-UNAVAILABLE',
    scope: 'signature',
    severity: 'high',
    summary: 'Signer context unavailable / 事件签名上下文不可用',
    impact: '关键签名上下文缺失，验证过程不可复现。 / Signer context missing, verification cannot be reproduced.',
    check: '确保在相同设备/浏览器下复验并保留原始 transcript。 / Re-verify using same machine/browser and keep original transcript.',
  },
  {
    code: 'EV-SENDER-MISMATCH',
    scope: 'signature',
    severity: 'high',
    summary: 'Event envelope sender mismatch / 发送方标识不匹配',
    impact: '事件被伪装成他人身份，协议完整性受损。 / Event is attributed to a different participant than transport sender.',
    check: '核验事件日志中 `sender` 与 `transportSender` 是否严格一致。 / Ensure wire `sender` and transport sender are exactly the same.',
  },
  {
    code: 'EV-PUBLIC-KEY-MISMATCH',
    scope: 'signature',
    severity: 'high',
    summary: 'Signing key identity mismatch / 签名密钥与 sender 不匹配',
    impact: '签名者身份不可追溯或被替换。 / Signer key does not resolve to declared sender identity.',
    check: '核对会话中该 peer 的 `SigningIdentity` 与广播声明。 / Verify peer signing identity and broadcasted claims.',
  },
  {
    code: 'EV-FINGERPRINT-MISMATCH',
    scope: 'signature',
    severity: 'high',
    summary: 'Fingerprint mismatch / 指纹不一致',
    impact: '公钥指纹异常，可能存在替换密钥。 / Public key fingerprint differs, possible key swap.',
    check: '对比 source/release 中指纹、启动日志与本地日志链。 / Compare fingerprints in release identity, startup log, and transcript.',
  },
  {
    code: 'EV-PAYLOAD-HASH-MISMATCH',
    scope: 'signature',
    severity: 'medium',
    summary: 'Payload hash mismatch / 载荷哈希不匹配',
    impact: '事件 payload 被篡改或序列化不一致。 / Event payload appears modified or serialized differently.',
    check: '确认同一条记录在不同端输出一致，再重签与复验。 / Confirm deterministic serialization and regenerate verification with original data.',
  },
  {
    code: 'EV-SIGNATURE-MISMATCH',
    scope: 'signature',
    severity: 'high',
    summary: 'Signature mismatch / 签名明文不匹配',
    impact: '签名与事件内容不一致，无法证明事件真伪。 / Signature does not match event payload; authenticity cannot be proven.',
    check: '检查签名版本与签名算法字段（ECDSA / P-256），对照源码。 / Check signing algorithm/version and key material versus source code.',
  },
  {
    code: 'EV-VERIFY-FAILED',
    scope: 'signature',
    severity: 'high',
    summary: 'General event verify failed / 事件验签失败',
    impact: '无法完成签名验证，当前事件不可靠。 / Verification routine failed; event is not trusted.',
    check: '重跑本地验证并复现错误，保留错误日志。 / Re-run local verify and keep the error logs.',
  },
  {
    code: 'TR-UNKNOWN',
    scope: 'transcript',
    severity: 'medium',
    summary: 'Unknown transcript failure / 未知 transcript 错误',
    impact: '仅有通用失败信息，需要原始日志与错误上下文。 / Generic transcript failure requiring raw logs and context.',
    check: '先导出完整 transcript 与版本信息，再结合本地恢复。 / Export full transcript plus version metadata and inspect locally.',
  },
  {
    code: 'EV-UNKNOWN',
    scope: 'signature',
    severity: 'medium',
    summary: 'Unknown signature failure / 未知签名错误',
    impact: '缺少精确分支，需外部上下文定位。 / Failure branch unknown; external context is needed.',
    check: '保留 verify 报错堆栈并对齐源码行号。 / Preserve verify stack trace and map to source line numbers.',
  },
];

const FAIRNESS_FAILURE_CODE_GUIDE_MAP = new Map<string, FairnessFailureCodeGuidance>(
  FAIRNESS_FAILURE_CODE_GUIDES.map((item) => [item.code, item]),
);

export function getFailureCodeGuide(code: string): FairnessFailureCodeGuidance | undefined {
  return FAIRNESS_FAILURE_CODE_GUIDE_MAP.get(code);
}

export function getFailureCodeGuides(): FairnessFailureCodeGuidance[] {
  return FAIRNESS_FAILURE_CODE_GUIDES.slice();
}
