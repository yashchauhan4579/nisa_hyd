// Forensics talks to the irisv3 crowd-AI sidecar (FastAPI :8000) through the Vite
// proxy, NOT the IRIS backend — so it uses its own /forensicsapi prefix.
export const FORENSICS_API = '/forensicsapi';

export const forensicsWsUrl = (video: string) => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${FORENSICS_API}/ws/analyze/${encodeURIComponent(video)}`;
};
