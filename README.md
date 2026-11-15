# puntingiq-site

## Live TrackIQ time display

Live race start times, feed/export/price timestamps and automatic result retry
times use the viewer's browser timezone, with its timezone abbreviation shown.
Adelaide viewers see ACDT in summer and ACST in winter.

Countdowns still compare absolute zoned race timestamps against the device clock;
changing the displayed timezone does not change the time remaining. The device
clock must be accurate. The canonical Sydney business date used for matching the
daily publication is unchanged.

## TrackIQ HOT Jockey and HOT Trainer alerts

Pro TrackIQ shows a dismissible alert when a jockey or trainer has two confirmed
winners at the same meeting on the current business date. Counts cover all
identity-verified runners, not just TrackIQ selections. Trainers count each
confirmed horse start; jockeys count confirmed rides.

Only confirmed starts in final races contribute. Official result-field names take
precedence. When final placings arrive before the full field, names may come from
an identity-verified Racing Australia/TABtouch racecard. These alerts are clearly
labelled **provisional**: the finishes are confirmed, but late rider/yard changes
can correct the attribution when result fields arrive. Racecard entries alone do
not prove a start; only final placings or a result record marked as having run do.
Scratchings, abandoned races and interim results do not count.
Racecards are fetched per meeting when required and cached for 15 minutes; a new
qualifying race can request a fresh read. Errors remain visible alongside the
participant alerts without interfering with normal result polling.
The updated renderer opts into provisional attribution with
`X-PuntingIQ-Participant-Attribution: racecard-v2` (v1 remains supported without
remaining bookings). Older open pages retain
official-only attribution until reloaded, so they cannot show provisional names
without the appropriate label.
Full-field enrichment can arrive after the initial winner confirmation, so the
cards label the denominator as confirmed rides/starters rather than assuming
eight or claiming complete meeting coverage. These are meeting-form indicators,
not additional betting advice, and do not send email notifications.

Alerts refresh with live results, are hidden when updates are delayed, and can be
dismissed separately by participant, meeting and day.

Each participant card lists remaining booked rides/runners at the same meeting,
with race, saddlecloth, horse and the live scheduled start in the viewer's local
timezone. Existing published systems and Top Picks are highlighted, not promoted
into new recommendations. Trainers count each horse separately, including
multiple starters in a race. Live scratchings, racecard scratchings, confirmed
starts, closed races and owner-voided races are excluded. Zero countdown alone
does not remove an open race.

The minute poller verifies upcoming racecards for HOT meetings; the member read
reuses the shared one-minute live feed for current lifecycle/scratching status.
Missing/unverified data shows an explicit awaiting-verification status rather
than a false zero count. A verified empty list hides the jockey/trainer alert,
even if other participants still have races left at that meeting. HOT Track and
HOT System alerts are unchanged. Bookings remain subject to late rider/trainer changes.

## Owner-confirmed individual no-race decisions

A missing provider result is never inferred to be a loss or cancellation. If the
provider has not reported an individual race cancellation, the owner can record
an explicit, auditable override using the engine's
`backend\cloudflare\record_race_void.py` utility:

```powershell
python backend\cloudflare\record_race_void.py --date 2026-11-15 --venue Hobart --race-number 2 --reason "Owner confirmed barriers opened early and race declared no race" --confirm
```

The utility requires today's private publication, an exact meeting/race match,
a reason and explicit confirmation. It uses existing Cloudflare administrative
credentials, not a public correction endpoint. Deploy the Worker/schema first.
TrackIQ shows **No race / refunded** with the owner-confirmed source in its
tooltip. Settlements refund to zero; HOT assessment and quaddie winners exclude
the race. No email is sent.

Provider JSON and polling state are not overwritten. The override is an effective
overlay; polling stops for that race while it is active. The database audit
rejects updates/deletes. To undo a decision, run the same command with `--revoke`
and a new reason: a new audit event restores the original provider result and
normal polling without deleting the previous decision.