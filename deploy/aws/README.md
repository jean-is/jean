# Jean on Amazon S3 behind CloudFront

S3 keeps Jean's files and CloudFront serves them over HTTPS, at the address Jean will keep. S3 alone can't: its website endpoints have no HTTPS and send no headers but a file's own. Three files here give them [the header set, the types and the pages without `.html`](../README.md):

- [`sync.sh`](sync.sh) uploads `dist/web/`, each file with its type and `Cache-Control: no-cache`, and deletes what is no longer there. The CLI's guesses vary with the computer it runs on, and a browser refuses a script, a style sheet or WebAssembly of the wrong type.
- [`headers.json`](headers.json) is a response headers policy: `nosniff`, `frame-ancestors 'self'` and HSTS.
- [`pages.js`](pages.js) is a CloudFront Function that answers `/privacy`, `/terms` and `/files` with their pages.

CloudFront compresses files up to 10 MB as it serves them; `sync.sh` uploads the one larger file that compresses, ONNX Runtime's WebAssembly (27 MB, 4 MB in brotli), as its brotli copy, which every browser Jean runs in reads.

## Set it up, once

With the AWS CLI signed in to the account, `jean-corp` standing for the bucket's name:

1. A private bucket, Block Public Access on:

```bash
aws s3 mb s3://jean-corp
```

2. The headers and the pages:

```bash
aws cloudfront create-response-headers-policy --response-headers-policy-config file://deploy/aws/headers.json
```

```bash
aws cloudfront create-function --name jean-pages --function-config Comment="Pages without .html",Runtime=cloudfront-js-2.0 --function-code fileb://deploy/aws/pages.js
```

```bash
aws cloudfront publish-function --name jean-pages --if-match <ETag that create-function returned>
```

3. In the CloudFront console, a distribution:
   - **Origin:** the bucket, through an origin access control, whose bucket policy the console offers to copy.
   - **Default root object:** `index.html`.
   - **Default behaviour:** Redirect HTTP to HTTPS; GET and HEAD; Compress objects automatically; the cache policy *CachingOptimized*; the response headers policy *jean*; under Function associations, *Viewer request*, CloudFront Functions, *jean-pages*.
   - **Alternate domain name:** the address Jean will keep, with its certificate from ACM in us-east-1.
4. A DNS record of that name for the distribution.

## Deploy

Build with Node 22 or later, from the repository's root, the organisation's policy beside it ([enterprise.md](../../docs/enterprise.md#policy-model-sketch)), then upload:

```bash
npm ci && POLICY="$(cat policy.json)" npm run build:web
```

```bash
deploy/aws/sync.sh jean-corp
```

Every file goes with `no-cache`, so CloudFront checks it with S3 again within a second (*CachingOptimized*'s shortest time) and no invalidation is needed.

## The organisation's own policy

Add it to `headers.json`'s `ContentSecurityPolicy`, after a semicolon, then `aws cloudfront update-response-headers-policy` with the policy's id and ETag:

```json
"ContentSecurityPolicy": "frame-ancestors 'self'; connect-src 'self' https://ai.corp.example"
```

## Check

Open `https://<the address>/policy.html`. Each line of the server's part should say it is sent.

## Update

Build and run `sync.sh` again. Each open Jean finds the new version and offers it; people keep their data.
