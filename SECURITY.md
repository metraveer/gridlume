# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/metraveer/gridlume/security/advisories/new)
(the **Report a vulnerability** button on the Security tab). English or Russian is fine.

Include what you found, how to reproduce it and which version you ran (`gridlume version`).
You will get an answer within a week; a fix and an advisory follow once the problem is confirmed.

## Supported versions

Gridlume is in early development. Only the latest release of each channel (stable and edge) gets fixes;
please update before reporting.

## What to know when running it

- The core serves plain HTTP and is meant for a trusted local network. The installer opens its port to
  the local subnet only. Do not expose it to the internet until HTTPS and two-factor sign-in arrive.
- Releases are signed with Ed25519. The core and the updater refuse files whose signature does not match
  the public key built into them (`internal/release`).
- Agents connect out to the core and authenticate with their own Ed25519 keys; no ports are opened on the
  machines they run on.

---

**RU.** Об уязвимостях сообщайте закрыто, через кнопку **Report a vulnerability** на вкладке Security
(ссылка выше), а не в открытых задачах. Можно на русском.
