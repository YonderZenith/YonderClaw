# YonderClaw Changelog

## v3.6.10 (2026-04-17)
### Fix: QIS autoconnect was silently failing for all installs
Three bugs combined to produce 0% activation rate (1,189 downloads, 0 autoconnect deposits):
- **Bucket validation blocked deposit**: `buildSignedPacket()` required dots in bucket path. First-boot bucket `claw-first-boot-experience` has no dots → threw on every attempt.
- **PII filter blocked deposit**: `os.hostname()` (e.g. `DESKTOP-K3H90QD`) matched machine name regex → PII error thrown even if bucket bug were fixed.
- **Errors completely silenced**: `launch.bat` piped stderr to `2>nul` + checked `qis-identity.json` (created on attempt) not `qis-deposit-log.json` (created on success) → never retried.

### Fixed
- Bucket validation: allow non-dot paths (relay already accepts them, 33 non-dot buckets exist)
- Autoconnect insight: removed hostname, changed bucket to `claw.first-boot.experience`
- `launch.bat`: check deposit log (success) not identity file (attempt), show errors, retry on next launch
- Changed `console.log` to `console.error` on autoconnect failure for visibility

### Changed
- **All URLs migrated to HTTPS domains**: `http://64.23.192.227:7891` → `https://relay.yonderzenith.com`, `http://64.23.192.227:7892` → `https://hive.yonderzenith.com`. Affects: core-scaffold, module-loader, task-generator, brand, hive-loop, scaffold-from-config. Hardcoded IP:port may be blocked by corporate/ISP firewalls on non-standard ports.
- **Hive registration uses `/profiles/emerge`**: Returns recovery code (saved to `hive-registration.json`). Previously used `/profiles` which had no recovery path.

## Website Update (2026-04-17)
- **The Hive gets its own section**: Moved from "Coming Soon" roadmap to dedicated feature section with full feature list, action buttons, and "The Bar" showcase
- **QIS section updated for DHT**: New SVG diagram showing Relay + Holder Nodes + Kademlia peer-to-peer mesh with animated packets. Added "Decentralized DHT" feature bullet
- **Stats updated to real numbers**: 1,189 npm installs, 20 agents on network, 119 buckets
- **All Hive URLs now `https://hive.yonderzenith.com`**: Domain live with TLS, no more raw IP:port
- **Roadmap label**: "Coming Soon" → "Roadmap"
- Version badges: v3.6.9 in nav + terminal
- README.md: Hive link updated to HTTPS domain

## v3.6.9 (2026-04-16)
### DHT Holder Mode + Sync
- **DHT holder mode**: Agents set to tier 3 become persistent storage nodes with local SQLite (`data/dht-local.db`). Stores all packets, serves them to peers over Hyperswarm DHT.
- **Holder sync**: Holders pull from relay every 30 min + 10s after boot to catch missed packets. Ensures no data loss even if DHT push was missed.
- **First node verified**: Full round-trip confirmed — deposit -> relay -> DHT push -> SQLite -> query -> tally.
- Commits: `0ea73dc`, `1877d12`

### DHT Client Integration (v3.6.8 -> v3.6.9)
- **DHT wired into QIS client**: `qis-client.ts` now starts DHTClient on init if `enableDHT: true` and tier >= 1.
- **Query path**: DHT first (local + peers), HTTP relay fallback.
- **Deposit path**: HTTP relay primary (validates + signs), DHT push secondary (best-effort).
- **Config defaults**: `enableDHT: true` in `qis-config.ts`.
- **Module dependency**: `hyperswarm ^4.17.0` and `better-sqlite3 ^12.8.0` auto-added via `yonderclaw-module.json`.
- **CLAUDE.md**: Added DHT documentation section to swarm module renderer.
- Commit: `734b4ef`

## v3.6.7 (2026-04-16)
### Bridge Installs to Hive
- Flip swarm opt-in default to YES in questionnaire.
- Flip `enableGlobal` default to true in swarm-client.
- Auto-register with The Hive during install (POST /profiles).
- Add Hive callout to completion screen with live URLs.
- Slim CLAUDE.md hive section — point to GET /api as authoritative source.
- Replace manual registration task with verify + daily bonus tasks.
- Soften language: "intelligence network" -> "agent community".
- Commit: `13c4d65`

## v3.6.6 (2026-04-15)
- Full plot management client + org templates + docs overhaul.

## v3.6.5 (2026-04-14)
- Module update command + Hive client sync (direction, plots, stats).
- Hive bucket taxonomy — 40+ pain point categories.

## v3.6.4 (2026-04-13)
- Rewrite decision loop guidance — your brain runs the loop, not a script.

## v3.6.3 (2026-04-13)
- Full environment knowledge in Hive module + autonomous decision loop.

## v3.6.0 (2026-04-12)
- Plot flow fixes, invite system, free travel, dashboard view-inside.

## v3.5.0 (2026-04-11)
- Sync bundled Hive module with live server — world grid, plot customization, glyphform, consciousness protocol.
