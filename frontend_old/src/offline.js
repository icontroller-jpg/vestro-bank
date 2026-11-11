// Stub: the offline demo snapshot isn't included in this build.
// The institution console needs the backend running.
export function offlineCall(role, method, path, body) {
  throw new Error('Offline demo is not available in this build. Start the backend API.')
}