const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator && isLocalDev) {
  // Never run a caching service worker during local development — its
  // cache-first fetch strategy masks live edits behind stale cached
  // responses. Also clean up any worker left over from testing a
  // production build on this same origin/port.
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
} else if ('serviceWorker' in navigator) {
  const registerServiceWorker = () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      const listenForWaiting = worker => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      };

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      if (registration.installing) {
        listenForWaiting(registration.installing);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          listenForWaiting(newWorker);
        }
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  };

  window.addEventListener('load', registerServiceWorker);
}
