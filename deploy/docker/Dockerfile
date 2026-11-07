# syntax=docker/dockerfile:1
# Jean in a container (D232): its files, as a web deploy serves them, behind nginx on port 8080,
# as a user other than root. The gateway (D191) and the relay (D45) are optional images: --target gateway, --target relay.
# Built from the repository's root, as compose.yaml does:
#   docker build -f deploy/docker/Dockerfile -t jean .
#   docker build -f deploy/docker/Dockerfile --target gateway -t jean-gateway .
#   docker build -f deploy/docker/Dockerfile --target relay -t jean-relay .

# npm run build:web: third-party code into vendor/, the listings, then dist/web/, Jean's own code minified
# and each file beside itself in brotli and gzip (D318), with esbuild, a dev dependency.
# Nothing runs at install: what is copied from node_modules needs no install script.
# The files are the same on every platform, so they are built once, on the builder's own; the
# stages after only copy, and an image for another platform runs nothing under emulation.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# Jean reads the policy.json beside index.html (docs/enterprise.md): an empty one, until the
# organisation mounts its own over it. Then dist/web/, what a web deploy serves, into /site.
RUN sed -i 's|</head>|<meta name="app-policy" content="policy.json">\n</head>|' app/index.html \
 && npm run build:web \
 && cp -R dist/web /site \
 && echo '{}' > /site/policy.json

# Node for the gateway and the relay: Node's image for the platform built, without npm, npx, corepack, yarn or the
# headers, which neither runs and which scanners would report. Copied past them rather than deleted, so nothing runs
# under emulation, and nothing that was left out sits in a layer below.
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS node
FROM scratch AS node-runtime
COPY --from=node --exclude=usr/local/lib/node_modules --exclude=usr/local/bin/npm --exclude=usr/local/bin/npx \
     --exclude=usr/local/bin/corepack --exclude=usr/local/bin/yarn --exclude=usr/local/bin/yarnpkg --exclude=opt/yarn-* \
     --exclude=usr/local/include / /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# The gateway: one module and Node, nothing to install, configured by GATEWAY_CONFIG. It runs as a user by number,
# which Kubernetes can tell isn't root, under Node's permission model: the network, and reading its own folder.
FROM node-runtime AS gateway
WORKDIR /app
COPY <<EOF package.json
{"type":"module"}
EOF
COPY gateway/ gateway/
ENV HOST=0.0.0.0 PORT=8787
USER 1000
EXPOSE 8787
CMD ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "gateway/serve.js"]

# The relay's empty folder, made on the builder's own platform like Jean's files, so that the relay's image runs
# nothing under emulation either.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS relay-data
RUN mkdir /data

# The relay: its two modules and the two of the share host's it uses, and Node, nothing to install, configured
# by RELAY_CONFIG. It keeps its mailboxes in /data, the user it runs as and group 0's, so that a volume Docker makes
# there starts as theirs, and whichever user OpenShift picks, always in group 0, writes there too. Under Node's
# permission model it writes nowhere else.
FROM node-runtime AS relay
WORKDIR /app
COPY <<EOF package.json
{"type":"module"}
EOF
COPY host/host.js host/sites.js host/serve.js host/
COPY relay/ relay/
COPY --from=relay-data --chown=1000:0 --chmod=770 /data /data
ENV HOST=0.0.0.0 PORT=8791 RELAY_DIR=/data
USER 1000
VOLUME /data
EXPOSE 8791
CMD ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--allow-fs-read=/data/", "--allow-fs-write=/data/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "relay/serve.js"]

# nginx's own configuration with two workers, rather than one for each of the machine's processors, which in a
# container limited to a fraction of them only takes memory. Written on the builder's own platform, the file
# being the same on every one; nginx's own tuning would rewrite it as the container starts, which a read-only
# root refuses.
FROM --platform=$BUILDPLATFORM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6 AS nginx-conf
RUN sed -i 's/^worker_processes .*/worker_processes 2;/' /etc/nginx/nginx.conf \
 && grep -qx 'worker_processes 2;' /etc/nginx/nginx.conf

# Jean: nginx's own image without root, as user 101, whose folders are group 0's, so any user OpenShift picks runs
# it as well. Its entrypoint writes nginx.conf into conf.d/ with CONTENT_SECURITY_POLICY in place, an extra policy
# that only tightens Jean's own (none by default), then brand.js and the manifests in the name APP_NAME gives Jean,
# if any, into /tmp (D698): with a read-only root, those two folders are the ones to leave writable.
FROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6
ENV CONTENT_SECURITY_POLICY="" APP_NAME=""
COPY --from=nginx-conf /etc/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 deploy/docker/app-name.sh /docker-entrypoint.d/40-app-name.sh
COPY --from=build /site /srv
EXPOSE 8080
