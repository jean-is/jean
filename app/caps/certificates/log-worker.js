// The public log's key for the check page (D276), fetched here as its readers are (D410), since the page's own policy
// reaches Jean's files only: Rekor's PEM, from the log the page names.
self.onmessage = ({ data: { id, log } }) => fetch(`${log}/api/v1/log/publicKey`).then((response) => (response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`))))
  .then((key) => self.postMessage({ id, type: 'done', key }), (error) => self.postMessage({ id, type: 'error', message: String(error) }))
