export async function loadNetworkConfig(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/api/network/config', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response?.ok) throw new Error('network config unavailable');
  const data = await response.json();
  return {
    network_enabled: data?.features?.network_enabled === true,
    talent_directory_enabled: data?.features?.talent_directory_enabled === true,
  };
}

async function setup(documentObject, environment = globalThis) {
  const entry = documentObject.querySelector('#network-entry');
  const unavailable = documentObject.querySelector('#network-unavailable');
  if (!entry) return;
  const hostname = environment.location?.hostname;
  if (
    ['localhost', '127.0.0.1', '::1'].includes(hostname)
    && environment.__FDE_NETWORK_PREVIEW__ !== true
  ) {
    entry.hidden = true;
    if (unavailable) unavailable.hidden = true;
    return;
  }
  try {
    const config = await loadNetworkConfig(environment.fetch?.bind(environment));
    const enabled = config.network_enabled && config.talent_directory_enabled;
    entry.hidden = !enabled;
    if (unavailable) unavailable.hidden = enabled;
  } catch {
    entry.hidden = true;
    if (unavailable) unavailable.hidden = false;
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  setup(document, window);
}
