/// <reference lib="webworker" />

interface HashWorkerRequest {
  id: string;
  file: Blob;
}

interface HashWorkerResponse {
  id: string;
  hash?: string;
  error?: string;
}

self.onmessage = async (event: MessageEvent<HashWorkerRequest>) => {
  const { id, file } = event.data;
  try {
    if (file.size > 20 * 1024 * 1024) {
      self.postMessage({ id, hash: undefined });
      return;
    }
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    const response: HashWorkerResponse = { id, hash: hex };
    self.postMessage(response);
  } catch (err) {
    const response: HashWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : 'Gagal menghitung hash file',
    };
    self.postMessage(response);
  }
};

export {};
