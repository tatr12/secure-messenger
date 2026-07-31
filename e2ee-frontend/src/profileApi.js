export async function updateProfile(
  accessToken,
  { displayName, bio },
  fetchImpl = fetch,
) {
  if (!accessToken) {
    const error = new Error('Active session token required');
    error.status = 401;
    throw error;
  }

  const response = await fetchImpl('/user/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ display_name: displayName, bio }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.detail || data.error || `Profile update failed: HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return data;
}
