export const environment = {
  production: true,
  /**
   * Even in prod, chat is local-only. The static viewer hits `localhost:8787`
   * — a chat-backend running on the user's machine. If you ship the viewer
   * to a server without a local chat-backend, this URL won't resolve and
   * the chat panel's health check will quietly disable itself.
   */
  chatBackendUrl: 'http://localhost:8787'
};
