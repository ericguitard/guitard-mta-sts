# Validation, Deployment, and Repository Configuration

This document is the single source of truth for policy change control, validation, release, hosting configuration, production monitoring, and rollback procedures for `mta-sts.guitard.ca`.

The policy file is security-critical. Pull requests validate the repository before merging, GitHub Pages publishes `main`, Cloudflare supplies the public redirect and response rules, and the live-service workflow checks production daily.

## 1. Prepare and validate a change

1. On GitHub, upload the changed files to a new branch created from the current `main` branch. GitHub web commits are signed by GitHub and satisfy the signed commit rule.
2. Open a pull request for the web-upload branch.
3. Install Node.js 24 and pnpm 11.19.0.
4. Run:

   ```text
   pnpm install --frozen-lockfile
   pnpm run check
   pnpm run validate:live
   ```

5. Open a pull request for the web-upload branch.
6. Confirm the `Validate / Validate repository` check runs automatically and succeeds.

The local checks validate formatting, HTML, CSS, JavaScript syntax, the MTA-STS policy, repository resources, documented response headers, and dependency security. The live check validates DNS, TLS reporting, HTTPS, redirects, headers, policy content, non-browser client access, assets, and the custom `404` response.

## 2. Control policy changes

Before changing `.well-known/mta-sts.txt`:

1. Confirm the domain's live MX records and the TLS certificates presented by every authorized exchanger.
2. If an MX migration is planned, reduce `max_age` well in advance and wait for the previous policy lifetime to expire.
3. Update and deploy the policy file first.
4. Confirm the policy URL returns `200`, does not redirect, uses `text/plain; charset=utf-8`, sends `Cache-Control: no-store`, and presents a valid HTTPS certificate.
5. Change the `_mta-sts.guitard.ca` TXT record to a new unique `id` only after the updated policy is live.
6. Review TLS aggregate reports at `security@guitard.ca` after deployment.

Changing the `404` page, CSS, `robots.txt`, documentation, or validation tooling does not require a new MTA-STS DNS `id` because those changes do not alter the policy.

## 3. Configure GitHub Pages

Under **Settings → Pages**:

1. Publish from the `main` branch and repository root.
2. Keep the custom domain set to `mta-sts.guitard.ca`.
3. Keep **Enforce HTTPS** enabled.

GitHub Pages publishes after a change reaches `main`. The required pull-request check prevents an unvalidated change from being merged and deployed.

## 4. Protect `main`

Under **Settings → Rules → Rulesets → Protect main**, retain these rules:

- Restrict deletions
- Require linear history
- Require signed commits
- Require a pull request before merging
- Require the `validate` GitHub Actions status check
- Block force pushes

Required approvals are set to `0` for the solo-maintainer repository. Increase the value when an independent reviewer is available. Keep the repository-admin bypass only for emergency recovery.

Under **Settings → Actions → General**:

1. Keep GitHub-authored actions enabled. The workflows do not require third-party actions.
2. Set the default workflow permission to read repository contents and packages.
3. Leave permission for GitHub Actions to create and approve pull requests disabled unless separate automation requires it.

## 5. Configure Cloudflare DNS and TLS

Confirm these settings:

1. `mta-sts` is a proxied CNAME to `ericguitard.github.io`.
2. SSL/TLS mode is **Full (strict)**.
3. **Always Use HTTPS** is enabled.
4. HSTS sends at least `max-age=31536000; includeSubDomains; preload`.
5. `_mta-sts.guitard.ca` publishes the current MTA-STS policy identifier.
6. `_smtp._tls.guitard.ca` publishes the TLS reporting record.

## 6. Configure the root redirect

Create a 301 redirect rule matching only the root path:

```text
lower(http.host) eq "mta-sts.guitard.ca"
and http.request.method in {"GET" "HEAD"}
and http.request.uri.path eq "/"
```

Redirect to:

```text
https://mta-sts.guitard.ca/.well-known/mta-sts.txt
```

Do not create a catch-all redirect. Unknown paths must retain their real `404` status.

## 7. Configure Cloudflare response headers

GitHub Pages publishes `_headers` as an ordinary file and does not interpret it as server configuration. The file documents the intentional production values verified by the automated checks; keep Cloudflare aligned with it.

### Common MTA-STS headers

Keep the Response Header Transform Rule matching:

```text
lower(http.host) eq "mta-sts.guitard.ca"
```

Configure it to:

- Remove `Access-Control-Allow-Origin`.
- Set `Content-Security-Policy: default-src 'none'; script-src https://static.cloudflareinsights.com; script-src-attr 'none'; connect-src 'self'; style-src 'self'; img-src https://assets.guitard.ca; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- Remove `Speculation-Rules`.
- Set `X-Robots-Tag: noindex, nofollow`.

Keep the existing shared security-header rule that supplies `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS, Permissions Policy, and the other zone-wide protections. Do not set the same response header in both rules.

### Policy cache control

Keep the later, policy-specific Response Header Transform Rule matching:

```text
lower(http.host) eq "mta-sts.guitard.ca"
and http.request.method in {"GET" "HEAD"}
and http.request.uri.path eq "/.well-known/mta-sts.txt"
and http.response.code eq 200
```

Set `Cache-Control: no-store`. MTA-STS clients use the policy's `max_age` field for protocol caching and must not use HTTP caching when retrieving an updated policy.

The policy endpoint does not require cross-origin browser access. MTA-STS clients fetch it directly over HTTPS.

## 8. Preserve automated-client access

MTA-STS is fetched by automated mail servers rather than web browsers. Keep the Cloudflare Configuration Rule named **Automated Client Access**, matching:

```text
lower(http.host) eq "mta-sts.guitard.ca"
```

Disable Browser Integrity Check for matching requests so empty and non-browser user agents cannot be challenged. Browser Integrity Check remains enabled for the rest of the zone.

## 9. Configure repository security and automation

Under **Settings → Code security and analysis**:

1. Enable the dependency graph.
2. Enable Dependabot alerts and security updates.
3. Enable secret scanning and push protection when available.
4. Optionally enable CodeQL default setup for JavaScript.

Dependabot checks npm dependencies and pinned GitHub Actions weekly.

Under repository **General** settings, use:

- Description: `MTA-STS policy and validation for guitard.ca.`
- Website: `https://mta-sts.guitard.ca/.well-known/mta-sts.txt`
- Suggested topics: `cloudflare`, `email-security`, `github-pages`, `mta-sts`

Issues may remain disabled because `SECURITY.md` provides a private reporting channel.

## 10. Merge and verify a deployment

1. Merge the pull request only after `Validate / validate` succeeds.
2. Confirm the GitHub Pages build and deployment completes successfully.
3. Run **Actions → Validate live service → Run workflow** after a policy, routing, DNS, TLS, or Cloudflare change.
4. Confirm the workflow validates the production policy, DNS records, TLS reporting, certificate, redirects, security headers, non-browser user agents, static resources, and custom `404` response.
5. When the policy changes, update the MTA-STS DNS `id` only after all production checks pass.

The scheduled live monitor runs daily at 10:23 UTC. GitHub may delay scheduled workflows during periods of high load, so the manual post-deployment check remains the primary release verification.

## 11. Rollback

If a deployment or policy change fails:

1. Revert the merge through a new signed pull request.
2. Wait for `Validate / validate` to succeed and merge the rollback.
3. Confirm GitHub Pages redeploys the reverted `main` branch.
4. Restore the previous Cloudflare rule or DNS record when the failure originated outside the repository.
5. Run the live-service workflow and review TLS reports after recovery.

Do not advance the MTA-STS DNS `id` until the restored policy is confirmed live.
