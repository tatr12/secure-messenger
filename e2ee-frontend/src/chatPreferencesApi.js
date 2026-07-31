export class ChatPreferencesApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ChatPreferencesApiError';
    this.status = status;
  }
}

function requireAccessToken(accessToken) {
  if (!accessToken) {
    throw new ChatPreferencesApiError('Active session token required', 401);
  }
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatPreferencesApiError(
      data.detail || `Chat preferences request failed: HTTP ${response.status}`,
      response.status,
    );
  }
  return data;
}

export function normalizeChatPreference(preference) {
  return {
    partner: preference.partner,
    pinned: Boolean(preference.pinned ?? preference.is_pinned),
    muted: Boolean(preference.muted ?? preference.is_muted),
    archived: Boolean(preference.archived ?? preference.is_archived),
    updatedAt: preference.updatedAt ?? preference.updated_at ?? null,
  };
}

export function indexChatPreferences(preferences = []) {
  return Object.fromEntries(
    preferences.map((preference) => {
      const normalized = normalizeChatPreference(preference);
      return [normalized.partner, normalized];
    }),
  );
}

export async function listChatPreferences(
  accessToken,
  fetchImpl = globalThis.fetch,
) {
  requireAccessToken(accessToken);
  const response = await fetchImpl('/chat-preferences', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const data = await parseResponse(response);
  return data.map(normalizeChatPreference);
}

export async function updateChatPreference(
  accessToken,
  partner,
  updates,
  fetchImpl = globalThis.fetch,
) {
  requireAccessToken(accessToken);
  const payload = {};
  if ('pinned' in updates) payload.is_pinned = updates.pinned;
  if ('muted' in updates) payload.is_muted = updates.muted;
  if ('archived' in updates) payload.is_archived = updates.archived;

  const response = await fetchImpl(
    `/chat-preferences/${encodeURIComponent(partner)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    },
  );
  return normalizeChatPreference(await parseResponse(response));
}
