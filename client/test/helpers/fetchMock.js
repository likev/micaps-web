// fetchMock.js - Mock fetch recorder for testing network and prefetch flows

export function createMockFetchRecorder(responseHandler = null) {
  const calls = [];
  const originalFetch = globalThis.fetch;

  const mockFetch = async (url, options = {}) => {
    const callRecord = { url: String(url), options, timestamp: Date.now() };
    calls.push(callRecord);

    if (responseHandler) {
      return responseHandler(url, options, callRecord);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ simulated: true, url: String(url) }),
      arrayBuffer: async () => new ArrayBuffer(8),
      text: async () => JSON.stringify({ simulated: true, url: String(url) }),
    };
  };

  globalThis.fetch = mockFetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    clear: () => {
      calls.length = 0;
    },
  };
}
