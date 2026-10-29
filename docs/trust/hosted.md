# Hosted copies

What Warehouse SAS's server sees and keeps when it serves an organisation's copy of Jean, at the organisation's own address or, for a trial, at a subdomain of jean.is (D456). It is for the security and privacy teams who choose between a hosted copy and serving Jean themselves. How the server is set up is in [deploy/](../../deploy/README.md#hosted-copies), what the organisation chooses in [enterprise.md](../enterprise.md#hosted-copies).

## Where it runs

On a server that runs nothing but Jean's services, rented from OVHcloud (OVH SAS, a French company), in its Gravelines data centre in France ([deploy/server/](../../deploy/server/README.md), D634). Caddy serves every hosted copy there, beside Jean's gateway, its share host and its key requests; jean.is's own files are on Bunny CDN. Warehouse SAS alone administers it, over SSH with a key. OVHcloud runs the building, the hardware and the network.

Two other services take part, and neither carries a visit:

- **Let's Encrypt** issues each address's certificate when its first visitor arrives. Like every public certificate, it is published in the Certificate Transparency logs, so from that day anyone can learn that `ai.acme.com` exists.
- **Cloudflare** answers DNS for jean.is and for the name organisations point their CNAME at, as DNS only: it sees lookups from people's resolvers, while their browsers connect straight to the server.

## What it sees

What any web server sees of a visit to an address it serves, since TLS ends there: the person's IP address, the address and files asked for, the time, and what a browser sends with every request, such as its User-Agent and languages. Jean sets no cookie and sends the server nothing of its own.

Once a browser has Jean, its service worker serves it from the device, and the server hears from it only:

- when Jean starts, for `policy.json` and to look for a new version, then again whenever Jean comes back on screen, at most every quarter of an hour (D138);
- when someone finds a capability, for that capability's files, whose names say which capability it is;
- after an update, for the new version's files.

It never sees requests, answers, files, memory, keys, sign-in tokens or anything sent to a brain, a gateway or a connected service. Those go from the browser to the addresses the policy names, and the address's `Content-Security-Policy`, which `npm run tenant` writes from that policy, keeps Jean to its own files and those addresses. A trial left open (`--open`) has no such limit, and still sends nothing through this server.

## What it keeps

- **Jean's files:** one release every hosted copy shares, the last five releases and any an address is pinned to. Hosted copies share files, never data: each address is an origin of its own, and the browser keeps each one's data apart.
- **Each address's `policy.json`**, and the Caddyfile listing the addresses and their headers. The registry they are written from, with every organisation's policy, stays with Warehouse SAS, off the server and outside this repository.
- **Each address's certificate and its private key**, in Caddy's store, which renews the certificate before it expires.
- **No log of visits.** Caddy holds ports 80 and 443, writes no access log and discards its own messages, and Docker keeps none of its containers' output. A visit to `http://ai.acme.com` is sent on to `https://`, and after the first, HSTS keeps the browser there.

## What it can't promise

- **The code is whatever the server sends.** Browsers have no code signing for web apps, so whoever serves an address controls its code and its header ([threat 14](threat-model.md#where-jean-comes-from)). The service worker checks every file against the hashes in `capabilities.json`, but they come from the same server: they catch a damaged file, not a hostile server.
- **No signed release to check it against.** A hosted copy's `index.html` names `policy.json`, which a signed release's doesn't, so its files can't be checked against a release's signed sums. Each release is built from a commit in git, never from a working tree (D320), and reaches every address that isn't pinned at once; a pinned address keeps its release until the organisation asks for another. An organisation that must hold the code and the header itself, or check them against Warehouse SAS's signature, serves Jean itself ([releases.md](releases.md)).
- **The address is on the open internet.** Anyone who knows it can open Jean there and read its `policy.json`, as every person's browser does. The organisation's sign-in and gateway guard its data, not the address; only a copy the organisation serves itself can sit behind its own network or sign-in.

## If the server is down, or the organisation leaves

- **Down:** people who have opened Jean before keep working, brains and gateway included: the service worker starts Jean from the device, with the policy as last read. A first visit, and an update, wait for the server.
- **Leaving:** at the organisation's own address, one DNS record moves its copy to its own server or another host, with everyone's data still there. At a subdomain of jean.is, people bring their data to the new address by backup and restore. Once an address is out of the registry, the server stops serving it and gets no new certificate for it.
