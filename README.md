# guitard.ca — MTA-STS Policy

> ⚠️ **Proprietary content.** Public access does not grant any licence to use these materials. See [Licence Notice](#licence-notice) below.

---

## About

This repository contains the MTA-STS email security policy used to operate and maintain [guitard.ca](https://guitard.ca) in accordance with [RFC 8461](https://datatracker.ietf.org/doc/html/rfc8461).

MTA-STS (Mail Transfer Agent Strict Transport Security) is an email security standard that instructs sending mail servers to authenticate TLS certificates and enforce encrypted delivery to guitard.ca mail infrastructure.

---

## Production Endpoint

```
https://mta-sts.guitard.ca/.well-known/mta-sts.txt
```

---

## DNS Record

The policy is activated by a DNS TXT record at `_mta-sts.guitard.ca`:

```
_mta-sts.guitard.ca.  TXT  "v=STSv1; id=20260718080000Z;"
```

> ⚠️ **Important:** The `id=` value **must be updated** whenever the policy file changes. Receiving servers use this value to detect stale cached copies. If `id=` is unchanged, remote servers will not re-fetch the updated policy, regardless of `max_age`.

---

## Current Policy

```
version: STSv1
mode: enforce
mx: mx01.mail.icloud.com
mx: mx02.mail.icloud.com
max_age: 2592000
```

| Key       | Value                  | Notes                                           |
|-----------|------------------------|-------------------------------------------------|
| `version` | `STSv1`                | Required literal                                |
| `mode`    | `enforce`              | Sending servers must use TLS or reject delivery |
| `mx`      | `mx01.mail.icloud.com` | Primary iCloud Mail exchanger                   |
| `mx`      | `mx02.mail.icloud.com` | Secondary iCloud Mail exchanger                 |
| `max_age` | `2592000`              | Policy cache duration — 30 days (seconds)       |

Mail for guitard.ca is routed through **Apple iCloud Mail** (Custom Domain).  
The authorised MX hosts are operated by Apple Inc.

---

## Deployment Notes

- Policy changes take effect once the updated file is live at the production endpoint **and** the `_mta-sts` DNS TXT record `id=` value has been incremented.
- `max_age` is set to **30 days**. Remote servers may cache this policy for up to 30 days. When planning MX changes or a mail provider migration, reduce `max_age` to `86400` (1 day) and wait a full cache cycle before making infrastructure changes.
- To validate the live policy: [MXToolbox MTA-STS Lookup](https://mxtoolbox.com/mta-sts.aspx)

---

## Licence Notice

All content in this repository — including source code, configuration files, documentation, text, designs, images, names, logos, trademarks, branding, visual identity, and related materials — is proprietary and remains the exclusive property of its respective rights holders.

Public access to this repository does not grant any licence or permission to copy, modify, reproduce, distribute, publish, sublicense, create derivative works from, or otherwise use its contents for any purpose, commercial or non-commercial.

Any third-party use requires prior written authorization from the applicable rights holder.

**All rights reserved.**

---

## Permissions

To request authorization for use of any asset in this repository, please contact Eric Guitard at [eric@guitard.ca](mailto:eric@guitard.ca).
