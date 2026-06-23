import {
  createEventSigner,
  generateSigningIdentity,
  verifySignedGameEvent,
} from "./eventSigning";

describe('event signing', () => {
  test('signs and verifies a public event', async () => {
    const identity = await generateSigningIdentity();
    const signer = await createEventSigner(identity);

    const signed = await signer.sign({
      sender: identity.peerId,
      scope: 'public',
      payload: {
        type: 'action/bet',
        round: 1,
        amount: 10,
      },
    });

    await expect(verifySignedGameEvent(signed, identity.peerId)).resolves.toEqual({
      ok: true,
    });
  });

  test('rejects payload tampering', async () => {
    const identity = await generateSigningIdentity();
    const signer = await createEventSigner(identity);

    const signed = await signer.sign({
      sender: identity.peerId,
      scope: 'public',
      payload: {
        type: 'action/bet',
        round: 1,
        amount: 10,
      },
    });

    const tampered = {
      ...signed,
      payload: {
        ...signed.payload,
        amount: 999,
      },
    };

    await expect(verifySignedGameEvent(tampered, identity.peerId)).resolves.toMatchObject({
      ok: false,
    });
  });
});
