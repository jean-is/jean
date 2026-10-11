# syntax=docker/dockerfile:1
# Jean in a container (D232): its files, as a web deploy serves them, behind nginx on port 8080,
# as a user other than root. The gateway (D191) is a second, optional image: --target gateway.
# Built from the repository's root, as compose.yaml does:
#   docker build -f deploy/docker/Dockerfile -t jean .
#   docker build -f deploy/docker/Dockerfile --target gateway -t jean-gateway .

# npm run build: third-party code into vendor/, the listings and the service worker's version.
# Nothing runs at install: what is copied from node_modules needs no install script.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund
COPY . .
# Jean reads the policy.json beside index.html (docs/enterprise.md): an empty one, until the
# organisation mounts its own over it. Then app/, what a web deploy serves (scripts/desktop.js), into /site.
RUN sed -i 's|</head>|<meta name="app-policy" content="policy.json">\n</head>|' app/index.html \
 && npm run build \
 && node --input-type=module -e "import { cp } from 'node:fs/promises'; import { shippedFiles } from './scripts/desktop.js'; for (const path of await shippedFiles('app')) await cp('app/' + path, '/site/' + path)" \
 && echo '{}' > /site/policy.json

# The gateway: one module and Node, nothing to install, configured by GATEWAY_CONFIG.
FROM node:24-alpine AS gateway
WORKDIR /app
COPY package.json ./
COPY gateway/ gateway/
ENV HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
CMD ["node", "gateway/serve.js"]

# Jean: nginx's own image without root. Its entrypoint writes nginx.conf into conf.d/ with
# CONTENT_SECURITY_POLICY in place, an extra policy that only tightens Jean's own (none by default).
FROM nginxinc/nginx-unprivileged:stable-alpine-slim
ENV CONTENT_SECURITY_POLICY=""
COPY deploy/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /site /srv
EXPOSE 8080
