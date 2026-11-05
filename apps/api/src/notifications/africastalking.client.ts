export interface AtCredentials {
  apiKey: string;
  username: string;
}

export interface AtSendArgs {
  to: string[];
  message: string;
  from?: string;
}

export interface AtSendResponse {
  SMSMessageData?: { Recipients?: Array<{ status?: string; messageId?: string }> };
}

/**
 * The one Africa's Talking call this app makes: send an SMS. Talking to the REST endpoint directly
 * keeps the official SDK, and its pinned axios/joi/body-parser, out of the dependency tree.
 * The account named `sandbox` is served from the sandbox host, as the SDK does.
 */
export function createAtClient({ apiKey, username }: AtCredentials) {
  const host = username.toLowerCase() === 'sandbox' ? 'sandbox.africastalking.com' : 'africastalking.com';
  const url = `https://api.${host}/version1/messaging`;

  return {
    SMS: {
      async send({ to, message, from }: AtSendArgs): Promise<AtSendResponse> {
        const body = new URLSearchParams({ username, to: to.join(','), message });
        if (from) body.set('from', from);

        const res = await fetch(url, {
          method: 'POST',
          headers: { apikey: apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(15_000),
        });
        // AT answers 201 Created on success; anything else is a rejection.
        if (res.status !== 201) {
          const detail = (await res.text().catch(() => '')).slice(0, 200);
          throw new Error(`Africa's Talking responded ${res.status}${detail ? `: ${detail}` : ''}`);
        }
        return (await res.json()) as AtSendResponse;
      },
    },
  };
}
