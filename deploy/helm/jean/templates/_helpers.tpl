{{/* Jean's chart (D232 · D702): names, labels, images, addresses, and the one security context every pod and container takes. */}}

{{- define "jean.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "jean.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* A component's name: Jean's is the release's, the gateway's and the relay's beside it. (dict "root" . "component" "relay") */}}
{{- define "jean.componentName" -}}
{{- $full := include "jean.fullname" .root -}}
{{- if eq .component "jean" -}}{{ $full }}{{- else -}}{{ printf "%s-%s" ($full | trunc 55 | trimSuffix "-") .component }}{{- end -}}
{{- end -}}

{{- define "jean.selectorLabels" -}}
app.kubernetes.io/name: {{ include "jean.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "jean.labels" -}}
{{ include "jean.selectorLabels" . }}
app.kubernetes.io/part-of: jean
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- with .root.Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "jean.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "jean.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* "true" on OpenShift: openshift true, or auto and the cluster serves security.openshift.io/v1. */}}
{{- define "jean.openshift" -}}
{{- $asked := toString .Values.openshift -}}
{{- if or (eq $asked "true") (and (eq $asked "auto") (.Capabilities.APIVersions.Has "security.openshift.io/v1")) -}}true{{- end -}}
{{- end -}}

{{/* An image: the mirror's registry over the image's own, then its digest, else its tag, else the chart's appVersion. (dict "root" . "image" .Values.jean.image) */}}
{{- define "jean.image" -}}
{{- $registry := .root.Values.global.imageRegistry | default .image.registry -}}
{{- $name := .image.repository -}}
{{- if $registry }}{{ $name = printf "%s/%s" $registry .image.repository }}{{ end -}}
{{- if .image.digest -}}
{{ printf "%s@%s" $name .image.digest }}
{{- else -}}
{{ printf "%s:%s" $name (.image.tag | default .root.Chart.AppVersion) }}
{{- end -}}
{{- end -}}

{{/* A component's address, its origin over HTTPS, or nothing without a host. (dict "root" . "component" "gateway") */}}
{{- define "jean.origin" -}}
{{- with (index .root.Values .component).host }}https://{{ . }}{{ end -}}
{{- end -}}

{{/* Whether the chart makes a Route or an Ingress for a component: "true" or nothing. */}}
{{- define "jean.exposed" -}}
{{- if and (index .root.Values .component).host (or .root.Values.route.enabled .root.Values.ingress.enabled) -}}true{{- end -}}
{{- end -}}

{{/*
The pod's side of the security every pod takes, the same for the three: its own account without a token, no service
links, never root, the runtime's seccomp profile. Outside OpenShift it names the component's user, group and volume
group; on OpenShift it leaves them to the SCC, which picks a user in the namespace's range and group 0.
(dict "root" . "component" "relay")
*/}}
{{- define "jean.podSecurity" -}}
{{- $root := .root -}}
{{- $context := (index $root.Values .component).podSecurityContext | default dict -}}
serviceAccountName: {{ include "jean.serviceAccountName" $root }}
automountServiceAccountToken: false
enableServiceLinks: false
{{- with $root.Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
securityContext:
  runAsNonRoot: true
  seccompProfile:
    type: RuntimeDefault
  {{- if not (include "jean.openshift" $root) }}
  {{- /* int64: values read as floats, which a number past a million would print as 1.00068e+09 */}}
  {{- with $context.runAsUser }}
  runAsUser: {{ int64 . }}
  {{- end }}
  {{- if hasKey $context "runAsGroup" }}
  runAsGroup: {{ int64 $context.runAsGroup }}
  {{- end }}
  {{- if hasKey $context "fsGroup" }}
  fsGroup: {{ int64 $context.fsGroup }}
  {{- end }}
  {{- end }}
  {{- with $context.fsGroupChangePolicy }}
  fsGroupChangePolicy: {{ . }}
  {{- end }}
  {{- with $context.supplementalGroups }}
  supplementalGroups:
    {{- toYaml . | nindent 4 }}
  {{- end }}
{{- end -}}

{{/* The container's side, the same for the three: no new privileges, no capability, a root filesystem it can't write. */}}
{{- define "jean.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  capabilities:
    drop:
      - ALL
  seccompProfile:
    type: RuntimeDefault
{{- end -}}

{{/* What every container does the same: probes on /, and five seconds for its address to leave the Service before it stops,
     waited by the command given: `sleep` in Jean's, Node in the gateway's and the relay's, which hold nothing else. */}}
{{- define "jean.lifecycle" -}}
startupProbe:
  httpGet:
    path: /
    port: http
  periodSeconds: 2
  failureThreshold: 30
readinessProbe:
  httpGet:
    path: /
    port: http
  periodSeconds: 10
  timeoutSeconds: 3
livenessProbe:
  httpGet:
    path: /
    port: http
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3
lifecycle:
  preStop:
    exec:
      command: {{ toJson . }}
{{- end -}}

{{/* Where a pod runs, as the component's values say. */}}
{{- define "jean.placement" -}}
{{- $values := index .root.Values .component -}}
{{- with $values.priorityClassName }}
priorityClassName: {{ . }}
{{- end }}
{{- with $values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $values.topologySpreadConstraints }}
topologySpreadConstraints:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{/* Jean's policy.json: the values' policy, with the gateway's and the relay's addresses when the chart runs them and policy.urls names neither. */}}
{{- define "jean.policy" -}}
{{- $policy := deepCopy (.Values.jean.policy | default dict) -}}
{{- $urls := deepCopy (get $policy "urls" | default dict) -}}
{{- range $component := list "gateway" "relay" -}}
{{- $origin := include "jean.origin" (dict "root" $ "component" $component) -}}
{{- if and (index $.Values $component).enabled $origin (not (hasKey $urls $component)) -}}
{{- $_ := set $urls $component (printf "%s/" $origin) -}}
{{- end -}}
{{- end -}}
{{- if $urls }}{{ $_ := set $policy "urls" $urls }}{{ end -}}
{{- toPrettyJson $policy -}}
{{- end -}}

{{/* GATEWAY_CONFIG from the values, its origins Jean's address unless named. */}}
{{- define "jean.gatewayConfig" -}}
{{- $config := deepCopy (.Values.gateway.config | default dict) -}}
{{- $origin := include "jean.origin" (dict "root" . "component" "jean") -}}
{{- if and $origin (not (hasKey $config "origins")) -}}
{{- $_ := set $config "origins" (list $origin) -}}
{{- end -}}
{{- toJson $config -}}
{{- end -}}

{{/* RELAY_CONFIG from the values, its origins Jean's address unless named. */}}
{{- define "jean.relayConfig" -}}
{{- $config := deepCopy (.Values.relay.config | default dict) -}}
{{- $origin := include "jean.origin" (dict "root" . "component" "jean") -}}
{{- if and $origin (not (hasKey $config "origins")) -}}
{{- $_ := set $config "origins" (list $origin) -}}
{{- end -}}
{{- toJson $config -}}
{{- end -}}

{{/* "true" when the relay takes each visitor's address from the router: proxied true, or auto and the chart exposes it. */}}
{{- define "jean.relayProxied" -}}
{{- $asked := toString .Values.relay.proxied -}}
{{- if or (eq $asked "true") (and (eq $asked "auto") (include "jean.exposed" (dict "root" . "component" "relay"))) -}}true{{- end -}}
{{- end -}}

{{/* One of route.enabled and ingress.enabled: OpenShift turns an Ingress into a Route of its own, which would answer the same host. */}}
{{- define "jean.checks" -}}
{{- if and .Values.route.enabled .Values.ingress.enabled -}}
{{- fail "route.enabled and ingress.enabled: choose one. On OpenShift an Ingress becomes a Route itself." -}}
{{- end -}}
{{- if and .Values.gateway.existingSecret.name .Values.gateway.config -}}
{{- fail "gateway.existingSecret.name and gateway.config: choose one." -}}
{{- end -}}
{{- end -}}
