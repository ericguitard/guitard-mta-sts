# guitard.ca — MTA-STS Policy

> ⚠️ **Proprietary content.** Public access does not grant a licence to copy, modify, redistribute, or republish this repository. See [Licence Notice](#licence-notice).

## About

This repository publishes the SMTP MTA Strict Transport Security policy for [guitard.ca](https://guitard.ca/) at the endpoint required by [RFC 8461](https://www.rfc-editor.org/info/rfc8461/):

```text
https://mta-sts.guitard.ca/.well-known/mta-sts.txt
```

MTA-STS tells participating sending mail servers to authenticate the TLS certificate presented by an authorized guitard.ca mail exchanger and to reject delivery when a secure, authenticated connection cannot be established.

The subdomain is a protocol endpoint rather than a general website. Its root address redirects to the published policy for human convenience; every other unknown path returns the custom 404 page.

## Current production configuration

### Policy

```text
version: STSv1
mode: enforce
mx: mx01.mail.icloud.com
mx: mx02.mail.icloud.com
max_age: 31557600
```

| Field | Value | Purpose |
| --- | --- | --- |
| `version` | `STSv1` | Required policy version |
| `mode` | `enforce` | Reject delivery when policy validation fails |
| `mx` | `mx01.mail.icloud.com` | Primary iCloud Mail exchanger |
| `mx` | `mx02.mail.icloud.com` | Secondary iCloud Mail exchanger |
| `max_age` | `31557600` | RFC maximum cache lifetime in seconds |

### DNS

```text
_mta-sts.guitard.ca.  TXT  "v=STSv1; id=20260812050000Z;"
_smtp._tls.guitard.ca. TXT "v=TLSRPTv1; rua=mailto:security@guitard.ca"
```

The TLS reporting record follows
[RFC 8460](https://www.rfc-editor.org/info/rfc8460/) and sends aggregate reports
to `security@guitard.ca`.

## Repository Structure

```text
.
├── .github/workflows/validate.yml   # Automated validation
├── .well-known/mta-sts.txt          # Protocol-critical policy
├── css/style.css                    # Custom 404 presentation
├── scripts/validate-policy.mjs      # RFC-oriented policy checks
├── .gitattributes                   # Stable policy line endings
├── .htmlvalidate.json               # HTML validation rules
├── .nojekyll                        # Publish .well-known on GitHub Pages
├── 404.html                         # Branded missing-page response
├── CNAME                            # GitHub Pages custom domain
├── robots.txt                       # Excludes this service from crawling
├── stylelint.config.mjs             # CSS validation rules
└── _headers                         # Desired headers; mirrored in Cloudflare
```

## Change Control

The policy file is security-critical. Before changing it:

1. Confirm the domain's live MX records and the TLS certificates presented by
   every authorized exchanger.
2. If an MX migration is planned, reduce `max_age` well in advance and wait for
   the previous policy lifetime to expire.
3. Update `.well-known/mta-sts.txt` and deploy it first.
4. Confirm the policy URL returns `200`, does not redirect, uses
   `text/plain; charset=utf-8`, and presents a valid HTTPS certificate.
5. Change the `_mta-sts.guitard.ca` TXT record to a new unique `id` only after
   the policy is live.
6. Review TLS reports at `security@guitard.ca` after deployment.

Changing the 404 page, CSS, robots file, documentation, or validation tooling
does **not** require a new MTA-STS DNS `id` because those changes do not alter the
policy.

## Cloudflare Configuration

GitHub Pages serves the repository, while Cloudflare supplies redirects and
response headers. GitHub Pages publishes `_headers` as an ordinary file; it
does not interpret it as server configuration. Keep the Cloudflare rules in
sync with the desired values documented there.

### Root Redirect

Match only the root path so the policy and custom 404 remain reachable:

```text
lower(http.host) eq "mta-sts.guitard.ca"
and http.request.method in {"GET" "HEAD"}
and http.request.uri.path eq "/"
```

Redirect with status `301` to:

```text
https://mta-sts.guitard.ca/.well-known/mta-sts.txt
```

Do not create a catch-all redirect. Unknown paths must retain their real `404`
status.

### Response Headers

Use one MTA-STS-specific response-header rule:

```text
lower(http.host) eq "mta-sts.guitard.ca"
```

- Remove `Access-Control-Allow-Origin`.
- Set `X-Robots-Tag: noindex, nofollow`.
- Set `Content-Security-Policy: default-src 'none'; style-src 'self'; img-src https://assets.guitard.ca; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.

Keep the existing shared security-header rule that supplies
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, HSTS, Permissions Policy, and the other zone-wide
protections. Do not set the same response header in both rules.

The policy endpoint does not require cross-origin browser access. MTA-STS
clients fetch it directly over HTTPS.

## Validation

Install dependencies and run the complete local check:

```powershell
pnpm install --frozen-lockfile
pnpm run check
```

The workflow checks formatting, HTML, CSS, JavaScript syntax, local resources,
robots syntax, the custom-domain file, policy grammar, required fields, allowed
MX patterns, policy size, and the maximum RFC cache lifetime.

After deployment, also confirm the live endpoint and DNS:

```powershell
curl.exe -I "https://mta-sts.guitard.ca/.well-known/mta-sts.txt"
curl.exe "https://mta-sts.guitard.ca/.well-known/mta-sts.txt"
Resolve-DnsName "_mta-sts.guitard.ca" -Type TXT
Resolve-DnsName "_smtp._tls.guitard.ca" -Type TXT
```

## Licence Notice

All content in this repository—including source code, configuration files, documentation, text, designs, images, names, logos, trademarks, branding, visual identity, itinerary data, and related materials—is proprietary and remains the exclusive property of its respective rights holders.

Access to this repository or its deployed content does not grant any licence or permission to copy, modify, reproduce, distribute, publish, sublicence, create derivative works from, or otherwise use its contents for any commercial or non-commercial purpose.

Any third-party use requires prior written authorization from the applicable rights holder.

**All rights reserved.**

## Permissions

To request authorization to use an asset or other repository content, contact Eric Guitard at [eric@guitard.ca](mailto:eric@guitard.ca).
