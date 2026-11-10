// sw.js's own global, for tsconfig.sw.json alone. TypeScript has a library for a dedicated worker's scope but none
// for a service worker's, so this adds to it what sw.js reads. Its `message` overrides the dedicated worker's
// MessageEvent, which skipLibCheck allows; no other worker shares this program. Types never ship.
interface WorkerGlobalScope {
  readonly clients: Clients
  readonly registration: ServiceWorkerRegistration
  skipWaiting(): Promise<void>
}
interface WorkerGlobalScopeEventMap {
  install: ExtendableEvent
  activate: ExtendableEvent
  fetch: FetchEvent
  message: ExtendableMessageEvent
  notificationclick: NotificationEvent
  push: ExtendableEvent
}
