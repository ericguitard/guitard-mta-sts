# guitard.ca — MTA-STS Policy

---

## About

This repository publishes the SMTP MTA Strict Transport Security policy for [guitard.ca](https://guitard.ca/) at the endpoint required by [RFC 8461](https://www.rfc-editor.org/info/rfc8461/):

```text
https://mta-sts.guitard.ca/.well-known/mta-sts.txt
```

MTA-STS tells participating sending mail servers to authenticate the TLS certificate presented by an authorized `guitard.ca` mail exchanger and to reject delivery when a secure, authenticated connection cannot be established.

The subdomain is a protocol endpoint rather than a general website. Its root redirects to the published policy for human convenience, while every other unknown path returns the custom `404` page.

---

## Current Production Configuration

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
_mta-sts.guitard.ca.   TXT "v=STSv1; id=20260812050000Z;"
_smtp._tls.guitard.ca. TXT "v=TLSRPTv1; rua=mailto:security@guitard.ca"
```

The TLS reporting record follows [RFC 8460](https://www.rfc-editor.org/info/rfc8460/) and sends aggregate reports to `security@guitard.ca`.

---

## Contents

- Published MTA-STS policy and custom-domain configuration
- Custom protocol-endpoint `404` page and stylesheet
- Documented Cloudflare response headers
- Local policy, resource, dependency, and production validation
- Pull-request validation and scheduled live-service monitoring
- Dependabot configuration for npm and GitHub Actions

---

## Authoritative Documentation

- [Validation, Deployment, and Repository Configuration](DEPLOYMENT.md)
- [Security Policy](SECURITY.md)
- [Rights, Licence, and Permissions](RIGHTS.md)
