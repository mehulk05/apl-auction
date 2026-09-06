# The Saleroom — IPL-style live player auction (V1)

Server-authoritative auction with live Socket.IO updates, a React auctioneer/owner/projector
UI, and file-based persistence (JSON source of truth + CSV export). No database.

The interface is built as an **auction-house catalogue**: lots are numbered from the auction
sequence, prices are hammer prices, and the bid ladder shows how the bidding actually climbed.
Type is Bodoni Moda (lot names and figures), IBM Plex Sans (chrome) and IBM Plex Mono
(lot numbers, IDs, ledger times). Operator screens are paper; the projector screen is ink.

```
React + Vite  ──HTTP + WebSocket──▶  Express + Socket.IO
 (client/)                             │
                                       ├── auction engine (rules, state machine, bid lock)
                                       ├── repository (atomic writes, backups)
                                       └── CSV exporter
                                              │
                                       data/auction.json  +  data/backups/
```

## Run it

```bash
npm run setup
```

```bash
npm run build
```

```bash
npm start
```

Open <http://localhost:3000>. For hot-reloading development instead:

```bash
npm run dev
```

That runs the API on `:3000` and Vite on `:5173` (Vite proxies `/api` and `/socket.io`).

## Test it

```bash
npm test
```

86 business-rule tests against the engine + 29 end-to-end tests against a real server
process with multiple Socket.IO clients (live broadcast, simultaneous bidding, reconnect
resync, restart recovery).

Populate a realistic mid-auction state for demos, or wipe everything:

```bash
node scripts/demo.js 30
```

```bash
npm run reset
```

## Who opens what

One link per person — each link is locked to its role, so nobody sees controls
that aren't theirs (replace the IP with your machine's):

| Link | Who | Sees |
|---|---|---|
| `http://<ip>:3000/control` | Auctioneer | full control |
| `http://<ip>:3000/bid/warriors` | Warriors' owner | their paddle only |
| `http://<ip>:3000/bid/titans` … | each owner | (any team name or id works as the slug) |
| `http://<ip>:3000/watch` | audience | dark view-only screen |
| `http://<ip>:3000/display` | projector | same, for the TV |

Team names are clickable everywhere — a popup shows that team's squad, purse
left, spend and bidding ceiling without leaving the room.

## Roles

Without a locked link, pick your role in the top-right selector; it is remembered per browser.

| Role | Sees |
|---|---|
| **Auctioneer** | Full control: start/pause/end, select or randomise players, start bidding, SOLD / UNSOLD, undo, corrections, captains, purse edits, settings, backups |
| **Team owner** | Their purse, squad, bidding ceiling, and a single **paddle** showing only the next legal bid |
| **Spectator** | Read-only |

`/display` is the **big screen** for a projector — inverted to ink, with the lot, the current
bid, the highest bidder and a purse tote. The nav bar inverts with it.

## Screens

`/` saleroom · `/players` catalogue · `/teams` + `/teams/:id` · `/squads` all squads ·
`/sold` results · `/unsold` passed over · `/history` the ledger · `/admin` conditions &
corrections · `/display` big screen

## Rules enforced (server-side, always)

| Rule | Default |
|---|---|
| Starting purse | ₹75 Cr |
| Squad size | min 11, max 14 |
| Bid increment | ₹1 Cr (configurable) |
| Base price | from the player's category (A+ 5, A 3, B+ 2, B 1) |
| Auction states | `WAITING → PLAYER_SELECTED → BIDDING → SOLD/UNSOLD`, plus `PAUSED`, `COMPLETED` |

A bid is accepted only if the auction is in `BIDDING`, a player is in the auction, the team
is active, has a squad slot free, has the purse, is not already the highest bidder, and the
amount **exactly equals** the current next bid. Everything else is rejected with a reason.

### One deliberate deviation from the spec

Spec §10 gives the minimum-squad reserve as:

```text
playersNeeded      = minSquad - currentSquadSize
maximumAllowedBid  = remainingPurse - playersNeeded × cheapestPlayer
```

That reserves one player too many. A team on 10 players with ₹1 Cr left computes
`maxBid = 1 - (11-10)×1 = 0` and can **never buy its 11th player** — the rule meant to
guarantee a minimum squad makes it unreachable.

The default `reserveMode: "corrected"` reserves for the players needed *after* this
purchase (`minSquad - squadSize - 1`), so that team can still bid its last ₹1 Cr.
Set `reserveMode: "spec"` in Admin Settings for the literal document formula
(the spec's own worked example then returns exactly ₹24 Cr, as written).

Both modes are covered by tests.

## Storage

`data/auction.json` is the live source of truth. Every action writes it via
`auction.tmp.json → fsync → validate → atomic rename`, so a crash mid-save cannot corrupt
it; if it ever does become unreadable, startup falls back to the newest valid backup.

Backups land in `data/backups/auction-backup-NNN-<label>.json` after every sale, every
admin correction, before every undo, at auction start, and on demand.

CSV is an **export**, not the live store:

| Endpoint | File |
|---|---|
| `/api/export/auction` | single file with the spec's `record_type` schema (§32) |
| `/api/export/players` | player pool |
| `/api/export/teams` | teams, purses, squads |
| `/api/export/sold` | sold results |
| `/api/export/transactions` | full activity log |

## API

Every mutation is one endpoint, so the socket and REST paths share the same validated code:

```bash
curl -X POST http://localhost:3000/api/action -H 'Content-Type: application/json' -d '{"type":"PLACE_BID","payload":{"teamId":"T001","amount":6}}'
```

`GET /api/state` returns the full snapshot · `GET /api/health` · `GET /api/backups`

Action types: `START_AUCTION` `PAUSE_AUCTION` `RESUME_AUCTION` `END_AUCTION` `SELECT_PLAYER`
`RANDOM_PLAYER` `START_BIDDING` `PLACE_BID` `MARK_SOLD` `MARK_UNSOLD` `SKIP_PLAYER`
`NEXT_PLAYER` `START_UNSOLD_ROUND` `REAUCTION_PLAYER` `RETURN_TO_POOL` `CORRECT_ALLOCATION`
`REMOVE_FROM_TEAM` `REMOVE_PLAYER` `ASSIGN_CAPTAIN` `ADJUST_PURSE` `UNDO` `EDIT_PLAYER`
`ADD_PLAYER` `EDIT_TEAM` `ADD_TEAM` `DELETE_TEAM` `UPDATE_SETTINGS` `UPDATE_CATEGORIES`
`CREATE_BACKUP` `RESET_AUCTION`

Sockets: client emits `action` (with ack) and `request:snapshot`; server emits `snapshot`
and `auction:event` (`PLAYER_SELECTED`, `BID_PLACED`, `BID_REJECTED`, `PLAYER_SOLD`,
`PLAYER_UNSOLD`, `TEAM_UPDATED`, `PURSE_UPDATED`, `CAPTAIN_UPDATED`, `STATE_CORRECTED`,
`AUCTION_PAUSED`, `AUCTION_RESUMED`, `AUCTION_COMPLETED`, `BACKUP_CREATED`).

## Deploy

Any Node host works — one process serves both the API and the built client.

```bash
docker build -t player-auction . && docker run -p 3000:3000 -v auction-data:/data player-auction
```

**Render:** the repo ships a `render.yaml` — New → Blueprint → pick this repo, done.
Build `npm install && npm install --prefix client && npm run build --prefix client`,
start `npm start`, health check `/api/health`. The free plan's disk is ephemeral: every
deploy resets the auction AND regenerates passwords — read them from the startup log.
For a real event use the Starter plan, uncomment the disk block in `render.yaml`, and
set `AUCTION_DATA_DIR=/var/data`. Railway / Fly work the same way with a mounted volume.

Environment: `PORT` (default 3000) · `AUCTION_DATA_DIR` (default `./data`).

## Passwords

`data/auth.json` is generated on first boot: one password per team and one for the
auctioneer. They survive `RESET_AUCTION` (delete the file and restart to regenerate).

- Placing a bid requires that team's password (or the auctioneer's).
- Every other action requires the auctioneer's password.
- Watching, snapshots and CSV exports need no password.
- Checks are server-side on both the socket and REST paths; the login screen
  (`POST /api/login`) verifies a password and keeps it per browser tab.
- `?key=<password>` in any URL logs that tab in without typing.
