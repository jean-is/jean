# syntax=docker/dockerfile:1
# Jean in a container (D232): its files, as a web deploy serves them, behind nginx on port 8080,
# as a user other than root. The gateway (D191) and the relay (D45) are optional images: --target gateway, --target relay.
# The relay's image runs the share host (D361) too, with node host/serve.js.
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
# Jean's version, which git gives (D735) and a build here, without the history, can't read: CI passes its run's
# (--build-arg VERSION=0.10.0). Without it, Settings › General names none.
ARG VERSION
# Jean reads the policy.json beside index.html (docs/enterprise.md): an empty one, until the
# organisation mounts its own over it. Then dist/web/, what a web deploy serves, into /site, without
# its gzip copies: nginx sends the brotli ones, and gzips as it goes for a browser that takes no brotli.
# Then the share host's viewer.json (scripts/host.js), for the relay's image: a share's page loads the render package
# this build names, @jean-is/render@<VERSION>-r<a hash of its files>, from jsDelivr, which CI's deploy of the same
# commit publishes. Without VERSION it names 0.0.0-r…, which npm never holds, and a share's page draws nothing.
RUN sed -i 's|</head>|<meta name="app-policy" content="policy.json">\n</head>|' app/index.html \
 && npm run build:web \
 && node scripts/host.js \
 && cp -R dist/web /site \
 && echo '{}' > /site/policy.json \
 && find /site -type f -name '*.gz' -exec sh -c 'for copy; do if [ -f "${copy%.gz}" ]; then rm "$copy"; fi; done' sh {} +

# Node for the gateway and the relay, and nothing else: no shell, no package manager, no tool an intruder could run.
# Its binary, stripped of its symbols and debugging information, 24 MB that nothing reads but a debugger; the Alpine
# packages whose libraries it links, each whole, with apk's record of them, and Alpine's release, so that scanners
# still see them; CA certificates; a user; and /tmp. Gathered on the builder's own platform, LLVM reading every
# platform's binaries, so nothing runs under emulation; the build stops if Node links a library left out.
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS node
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS node-files
RUN apk add --no-cache llvm
COPY --from=node / /node
RUN mkdir -p /target/lib/apk/db /target/usr/local/bin /target/etc /target/tmp \
 && awk -v keep=' musl libgcc libatomic libstdc++ ca-certificates-bundle alpine-release ' -v db=/target/lib/apk/db/installed ' \
      BEGIN { RS = ""; FS = "\n" } \
      { name = ""; for (i = 1; i <= NF; i++) if ($i ~ /^P:/) name = substr($i, 3) } \
      index(keep, " " name " ") { \
        printf "%s\n\n", $0 > db; \
        for (i = 1; i <= NF; i++) if ($i ~ /^F:/) dir = substr($i, 3); else if ($i ~ /^R:/) print dir "/" substr($i, 3) \
      }' /node/lib/apk/db/installed > /files \
 && tar -C /node -cf - -T /files | tar -C /target -xf - \
 && llvm-strip -o /target/usr/local/bin/node /node/usr/local/bin/node \
 && printf 'root:x:0:0:root:/root:/sbin/nologin\nnode:x:1000:1000:node:/home/node:/sbin/nologin\n' > /target/etc/passwd \
 && printf 'root:x:0:root\nnode:x:1000:node\n' > /target/etc/group \
 && chmod 1777 /target/tmp \
 && interpreter=$(llvm-readelf -l /target/usr/local/bin/node | sed -n 's/.*interpreter: \(.*\)]$/\1/p') \
 && test -e "/target$interpreter" \
 && for elf in /target/usr/local/bin/node $(find /target/lib /target/usr/lib -name '*.so*' -type f); do \
      for lib in $(llvm-readelf --needed-libs "$elf" | sed -n 's/^ *\(lib[^ ]*\)$/\1/p'); do \
        test -e "/target/lib/$lib" || test -e "/target/usr/lib/$lib" || { echo "$elf links $lib, which isn't copied"; exit 1; }; \
      done; \
    done
FROM scratch AS node-runtime
COPY --from=node-files /target/ /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Jean's own labels, OCI's, which the gateway and the relay each give their name and words. Its version, revision
# and date come from CI, which builds with them; a build of its own is "dev".
ARG VERSION=dev REVISION="" CREATED=""
LABEL org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Warehouse SAS" \
      org.opencontainers.image.authors="Warehouse SAS" \
      maintainer="Warehouse SAS" \
      org.opencontainers.image.url="https://jean.is" \
      org.opencontainers.image.source="https://github.com/jean-is/jean" \
      org.opencontainers.image.documentation="https://github.com/jean-is/jean/blob/main/deploy/docker/README.md" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

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
LABEL org.opencontainers.image.title="jean-gateway" \
      org.opencontainers.image.description="Jean's gateway, on Node on port 8787, for the services a browser can't reach"
EXPOSE 8787
CMD ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "gateway/serve.js"]

# The relay's empty folder, made on the builder's own platform like Jean's files, so that the relay's image runs
# nothing under emulation either.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS relay-data
RUN mkdir /data

# The relay: its modules and the share host's, which it uses, and Node, nothing to install, configured by RELAY_CONFIG.
# The same image runs the share host with node host/serve.js in place of relay/serve.js, configured by HOST_CONFIG,
# keeping its shares in HOST_DIR, and showing them with the viewer of this build beside it. Each keeps its files in
# /data, the user it runs as and group 0's, so that a volume Docker makes there starts as theirs, and whichever user
# OpenShift picks, always in group 0, writes there too. Under Node's permission model it writes nowhere else.
FROM node-runtime AS relay
WORKDIR /app
COPY <<EOF package.json
{"type":"module"}
EOF
COPY host/host.js host/sites.js host/serve.js host/
COPY --from=build /src/dist/host/viewer.json host/
COPY relay/ relay/
COPY --from=relay-data --chown=1000:0 --chmod=770 /data /data
ENV HOST=0.0.0.0 PORT=8791 RELAY_DIR=/data HOST_DIR=/data
USER 1000
VOLUME /data
LABEL org.opencontainers.image.title="jean-relay" \
      org.opencontainers.image.description="Jean's relay, on Node on port 8791, where a person's devices and the people they send to meet"
EXPOSE 8791
CMD ["node", "--permission", "--allow-net", "--allow-fs-read=/app/", "--allow-fs-read=/data/", "--allow-fs-write=/data/", "--disallow-code-generation-from-strings", "--disable-warning=ExperimentalWarning", "relay/serve.js"]

# nginx's own configuration with two workers, rather than one for each of the machine's processors, which in a
# container limited to a fraction of them only takes memory. Written on the builder's own platform, the file
# being the same on every one; nginx's own tuning would rewrite it as the container starts, which a read-only
# root refuses.
FROM --platform=$BUILDPLATFORM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6 AS nginx-conf
RUN sed -i 's/^worker_processes .*/worker_processes 2;/' /etc/nginx/nginx.conf \
 && grep -qx 'worker_processes 2;' /etc/nginx/nginx.conf

# nginx's image for the platform built, which Jean's starts from.
FROM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6 AS nginx

# Alpine's fixes that nginx's image doesn't have yet, for which Trivy fails CI: musl and musl-utils 1.2.6-r3
# (CVE-2026-107891) and zlib after 1.3.2-r0 (CVE-2026-85091). apk upgrades them in a copy of the image for the
# platform built, from the builder's own platform, running nothing of that copy's, and Jean's image takes only the
# files they change and apk's record of them, so that an image for another platform still runs nothing under
# emulation. This stage and the COPY from it go once nginx's image at the digest pinned has them, which Trivy says
# when it scans that image alone.
FROM --platform=$BUILDPLATFORM nginxinc/nginx-unprivileged:stable-alpine-slim@sha256:5d8bb9437d74a600ec5dbf90c035451c724dc33eac8d3a71078f6f8612c345f6 AS alpine-fixes
USER root
COPY --from=nginx / /target
RUN apk --root /target upgrade --no-cache --no-scripts musl musl-utils zlib \
 && mkdir /fixes \
 && apk --root /target info -qL musl musl-utils zlib | grep . \
  | tar -C /target -cf - -T - lib/apk/db/installed lib/apk/db/scripts.tar.gz lib/apk/db/triggers \
  | tar -C /fixes -xf -

# Jean: nginx's own image without root, as user 101, whose folders are group 0's, so any user OpenShift picks runs
# it as well. Its entrypoint writes nginx.conf into conf.d/ with CONTENT_SECURITY_POLICY in place, an extra policy
# that only tightens Jean's own (none by default), then brand.js and the manifests in the name APP_NAME gives Jean,
# if any, into /tmp (D698): with a read-only root, those two folders are the ones to leave writable.
FROM nginx
ENV CONTENT_SECURITY_POLICY="" APP_NAME=""
COPY --from=alpine-fixes /fixes/ /
COPY --from=nginx-conf /etc/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 deploy/docker/app-name.sh /docker-entrypoint.d/40-app-name.sh
COPY --from=build /site /srv
# Jean's own labels, OCI's, in place of nginx's, which its image would otherwise pass on: Jean's files are MIT's, but for
# ee/, the enterprise integrations, under the Elastic License 2.0 (ee/GRANT.md).
ARG VERSION=dev REVISION="" CREATED=""
LABEL org.opencontainers.image.title="jean" \
      org.opencontainers.image.description="Jean, served by nginx without root on port 8080" \
      org.opencontainers.image.licenses="MIT AND Elastic-2.0" \
      org.opencontainers.image.vendor="Warehouse SAS" \
      org.opencontainers.image.authors="Warehouse SAS" \
      maintainer="Warehouse SAS" \
      org.opencontainers.image.url="https://jean.is" \
      org.opencontainers.image.source="https://github.com/jean-is/jean" \
      org.opencontainers.image.documentation="https://github.com/jean-is/jean/blob/main/deploy/docker/README.md" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"
EXPOSE 8080
