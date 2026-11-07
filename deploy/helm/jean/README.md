# Jean's Helm chart

Jean, and its gateway and relay when asked for, on Kubernetes or OpenShift (D232 · D702). It runs the three images [deploy/docker/](../../docker/README.md) builds, under OpenShift's `restricted-v2` SCC or Pod Security "restricted", with whichever user the cluster picks. MIT, as everything outside `ee/` is.

- **`jean`** serves Jean's files with nginx, on port 8080. It keeps nothing: each person's data stays in their browser, tied to the address Jean is served from.
- **`gateway`** (off by default) relays to the services a browser can't reach, such as Gmail, Microsoft 365 or Slack (D191), on port 8787.
- **`relay`** (off by default) keeps sealed mailboxes for a person's devices and the people they send to (D45), on port 8791, in a volume of its own.

Each one answers at a host of its own over HTTPS, through an OpenShift Route or an Ingress the chart makes, or one of yours.

## Install it

CI publishes the chart with each version tagged, signed as the images are ([verify it](../../docker/README.md#verify-an-image)):

```bash
helm install jean oci://ghcr.io/jean-is/charts/jean --namespace jean --create-namespace -f values.yaml
```

`--version` pins one version, the same number as Jean's. From a checkout, `deploy/helm/jean` in place of the address installs the chart as it is there, its images `edge`, which follows `main`.

A `values.yaml` for OpenShift with the gateway and the relay:

```yaml
jean:
  host: jean.apps.corp.example
  policy:
    capabilities:
      preUnlock: [connections]
gateway:
  enabled: true
  host: gateway.apps.corp.example
  existingSecret:
    name: jean-gateway-config
relay:
  enabled: true
  host: relay.apps.corp.example
route:
  enabled: true
networkPolicy:
  enabled: true
```

The gateway's and the relay's addresses go into the policy's `urls` on their own, and Jean's address into their `origins`. The gateway's Secret holds its `GATEWAY_CONFIG`:

```bash
oc create secret generic jean-gateway-config -n jean --from-literal=GATEWAY_CONFIG='{"origins":["https://jean.apps.corp.example"]}'
```

Then open `https://jean.apps.corp.example/policy.html`: it says what the server sends and what the policy holds.

## Values

[values.yaml](values.yaml) holds every value with a word on each, and [values.schema.json](values.schema.json) refuses a name it doesn't know, so a typo stops the install. The policy, which [app/schemas/policy.schema.json](../../../app/schemas/policy.schema.json) describes, and what Kubernetes defines (`affinity`, `tolerations`…) aren't checked there.

| Value | What it does |
|---|---|
| `openshift` | `auto` (default): OpenShift when the cluster serves `security.openshift.io/v1`. `helm template` and tools that render without the cluster can't tell: set `true` or `false` there. |
| `global.imageRegistry`, `imagePullSecrets` | A registry that mirrors `ghcr.io`, for every image, and its pull secrets. |
| `<component>.image` | `registry`, `repository`, `tag` (the chart's `appVersion` when empty) and `digest` (`sha256:…`, which pins the image and is used instead of the tag). |
| `<component>.host` | The host it answers at, such as `jean.corp.example`. Jean's is where everyone's data stays: choose it once. |
| `jean.replicaCount`, `gateway.replicaCount` | 2 by default, with a PodDisruptionBudget above 1. The relay has none: it is always one. |
| `jean.policy` | The organisation's `policy.json` ([enterprise.md](../../../docs/enterprise.md#policy-model-sketch)), served at `/srv/policy.json`; a change rolls the pods. |
| `jean.appName` | `APP_NAME`: what people see Jean called, in the room and on their list of apps. |
| `jean.contentSecurityPolicy` | `CONTENT_SECURITY_POLICY`: a header over Jean's own, which can only take away. |
| `gateway.existingSecret` | A Secret of yours holding `GATEWAY_CONFIG` under `key`, the recommended way: its apps' secrets stay out of the values. |
| `gateway.config` | Or `GATEWAY_CONFIG` itself ([its schema](../../../app/schemas/gateway.schema.json)), which the chart writes into a Secret. |
| `gateway.proxy` | `http`, `https`, `noProxy`: a corporate proxy, set as `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` with `NODE_USE_ENV_PROXY=1`, without which Node's `fetch` uses none. |
| `gateway.trustedCA` | Certificates the gateway trusts beyond Node's own, as `NODE_EXTRA_CA_CERTS`: `configMap: openshift` for the cluster's trusted bundle, or a ConfigMap of yours with PEM certificates under `key`. |
| `relay.config` | `RELAY_CONFIG`: `origins`, `limits` (any of `LIMITS` in [relay.js](../../../relay/relay.js)) and `recordKey`, the public key its records are sealed to (`node host/serve.js keys`). The schema refuses a private key there. |
| `relay.proxied` | `RELAY_PROXIED=1`. `auto`: when the chart makes a Route or an Ingress for it. |
| `relay.persistence` | `size` (10Gi), `storageClass`, `existingClaim`. |
| `<component>.podSecurityContext` | Outside OpenShift: `runAsUser` (101 for Jean, 1000 for the others), `runAsGroup`, `fsGroup` (1000 for the relay), `fsGroupChangePolicy`, `supplementalGroups`. |
| `<component>.resources` | Small requests and limits, set. |
| `route.enabled`, `route.annotations` | A Route per component with a host; `<component>.route.annotations` over these. |
| `ingress.enabled`, `ingress.className`, `ingress.annotations`, `ingress.tls` | An Ingress per component with a host; `<component>.ingress.annotations` and `<component>.ingress.tlsSecret` for each. One of Routes and Ingresses: OpenShift turns an Ingress into a Route itself. |
| `networkPolicy` | `enabled`, `ingressNamespaceSelector` (the router's namespace), `extraEgress` (the gateway's other destinations). |

## What every pod gets

The same two helpers in `_helpers.tpl` write it for the three, so none can drift:

- Its own ServiceAccount, with no role bound and its token never mounted (`automountServiceAccountToken: false`), and no service links in its environment.
- `runAsNonRoot`, the runtime's seccomp profile, no privilege escalation, every capability dropped, and a read-only root filesystem. Jean writes only to two `emptyDir` volumes, `/tmp` and `/etc/nginx/conf.d`; the gateway nowhere; the relay to `/data`. Node runs them under its permission model besides: the network, reading their own code, and for the relay its folder.
- Probes on `/`, which nginx answers with Jean and the two others with `{"format":1,…}`, and five seconds' sleep before it stops, so that the Service sends it nothing more by the time it closes. Each stops cleanly on SIGTERM.

## OpenShift

- **The SCC.** `restricted-v2`, the default, runs all three: the chart names no user, group or volume group there, so OpenShift picks a user in the namespace's range, in group 0, which owns what the images write to. No SCC of its own, and no `anyuid`.
- **Routes.** `route.enabled` makes one per host, TLS ending at the router on its own certificate, plain HTTP sent on to HTTPS, and HSTS for a year. The gateway's waits 5 minutes for an answer that streams, the relay's 60 seconds for its reads, which wait 25. A certificate of your own comes through an annotation, such as cert-manager's for Routes.
- **A TLS-inspecting proxy.** `gateway.trustedCA.configMap: openshift` makes a ConfigMap labelled `config.openshift.io/inject-trusted-cabundle: "true"`, which OpenShift fills with the cluster's trusted bundle, the proxy's certificate included, and the gateway reads it.
- **The router's network.** The NetworkPolicy lets in namespaces labelled `policy-group.network.openshift.io/ingress`, the default IngressController's. A router on the host's network (`endpointPublishingStrategy: HostNetwork`) comes from `policy-group.network.openshift.io/host-network` instead: name it in `networkPolicy.ingressNamespaceSelector`.
- **A mirror.** On a disconnected cluster, an `ImageDigestMirrorSet` sends `ghcr.io/jean-is` to the mirror, the images pinned by `digest`; or `global.imageRegistry` names it. Copy the signatures with the images (`cosign copy`).

### Signed images only

CI signs each image, and the chart, keyless: the signature carries the identity of the workflow that built it, `https://github.com/jean-is/jean/.github/workflows/ci.yml@refs/heads/main` or `…@refs/tags/v…`, from the issuer `https://token.actions.githubusercontent.com`, recorded in Sigstore's public log. OpenShift's own `ClusterImagePolicy` (`config.openshift.io/v1`) matches only a certificate issued to an email address, so it can't check that identity. Sigstore's policy controller can, on OpenShift or any cluster, in the namespaces labelled `policy.sigstore.dev/include: "true"`:

```yaml
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: jean
spec:
  images:
    - glob: "ghcr.io/jean-is/**"
  authorities:
    - keyless:
        url: https://fulcio.sigstore.dev
        identities:
          - issuer: https://token.actions.githubusercontent.com
            subjectRegExp: '^https://github\.com/jean-is/jean/\.github/workflows/ci\.yml@refs/(heads/main|tags/v.*)$'
      ctlog:
        url: https://rekor.sigstore.dev
```

Red Hat Advanced Cluster Security and Kyverno's `verifyImages` check the same issuer and identity.

## The relay

- **One replica, replaced rather than rolled** (`strategy: Recreate`). Its waiting reads, each mailbox's turn and its rate limits live in its memory, and its volume is `ReadWriteOnce`: a second pod would neither wake the first one's readers nor share its limits. The schema has no `replicaCount` for it. A new version or a drained node leaves it out for the seconds a pod takes to start.
- **Its volume.** It takes no message while under 1 GB is free (`limits.free`), answering 507, so the default 10Gi leaves room for about 9 GB of messages, each kept 7 days at most. The volume gets the pod's group (`fsGroup`) as it mounts; a driver that ignores `fsGroup`, as some NFS ones do, needs its root writable by group 0. The claim stays when the release is uninstalled, since it holds messages not yet read.
- **Behind the router.** With `RELAY_PROXIED=1`, the relay takes each visitor's address from the last `X-Forwarded-For` entry, which OpenShift's router and most controllers append; without it everyone shares the router's address, and so its 60 mailboxes opened an hour. Since anything that reaches its port could write that header, turn `networkPolicy` on. A router that doesn't send `X-Client-Port` leaves the records of each change with the router's port rather than the visitor's.
- **Its limits.** They are made for a household's address, and people at work share a few, sometimes one: raise `limits.opens` (mailboxes a network opens an hour, 60) and `limits.sent` (bytes a network sends a day, 256 MB) by about the number of people behind one address.

## The gateway

Keep its `hosts` to the services people use. It answers only the `origins` it names, but a program other than a browser can send any `Origin`, so `hosts` is what bounds where it relays, and its NetworkPolicy keeps it from the cluster's and private addresses whatever `hosts` says. Behind a proxy, add the proxy's address to `networkPolicy.extraEgress`:

```yaml
networkPolicy:
  extraEgress:
    - to:
        - ipBlock:
            cidr: 10.20.30.40/32
      ports:
        - port: 3128
          protocol: TCP
```

## An Ingress

The chart adds no annotation of any controller's. What each host needs from yours:

| Host | Needs |
|---|---|
| Jean | Nothing beyond TLS. |
| The gateway | Answers streamed as they come, unbuffered, for up to 5 minutes; requests up to 10 MB. |
| The relay | Requests of 26 MB (a message is 25 MB at most); reads held 60 seconds; the visitor's address appended to `X-Forwarded-For`, and its port as `X-Client-Port` if the controller can. |

With ingress-nginx, for example, the relay takes `nginx.ingress.kubernetes.io/proxy-body-size: 26m` and `nginx.ingress.kubernetes.io/proxy-read-timeout: "60"` under `relay.ingress.annotations`, and the gateway `nginx.ingress.kubernetes.io/proxy-buffering: "off"` and `nginx.ingress.kubernetes.io/proxy-read-timeout: "300"`.

## What each NetworkPolicy allows

With `networkPolicy.enabled`, each pod takes in and sends out only this:

| Pod | In | Out |
|---|---|---|
| Jean | From the router's namespace, on 8080 | Nothing |
| The gateway | From the router's namespace, on 8787 | DNS (53 and 5353) to the cluster's namespaces; TCP 443 and 80 to any address but `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `169.254.0.0/16`, `fc00::/7` and `fe80::/10`; and `networkPolicy.extraEgress` |
| The relay | From the router's namespace, on 8791 | Nothing |

The router's namespace is `networkPolicy.ingressNamespaceSelector`, or OpenShift's `policy-group.network.openshift.io/ingress` there. Elsewhere it has no default: without it nothing reaches the pods, and the install's notes say so. For ingress-nginx:

```yaml
networkPolicy:
  enabled: true
  ingressNamespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: ingress-nginx
```

## Update it

`helm upgrade` with the new version. Jean's pods roll one at a time, and each open Jean finds the new version and offers it; people keep their data, which stays in their browsers.
