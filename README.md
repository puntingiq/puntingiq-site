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

Only final result records marked as having run, with official participant names,
contribute. Scratchings, abandoned races and interim results do not count.
Full-field enrichment can arrive after the initial winner confirmation, so the
cards label the denominator as confirmed rides/starters rather than assuming
eight or claiming complete meeting coverage. These are meeting-form indicators,
not additional betting advice, and do not send email notifications.

Alerts refresh with live results, are hidden when updates are delayed, and can be
dismissed separately by participant, meeting and day.