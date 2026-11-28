// Single source of truth for racing venue naming.
//
// Edit ONLY this file when a venue mismatch appears, then:
//  1. copy it byte-for-byte to C:\PuntingIQ-site\assets\venue-aliases.mjs
//     (next-race.test.mjs fails if the copies differ),
//  2. redeploy the Worker (deploy_next_race.py) and publish the website.
// Python reads the JSON block below via ML_Engine\venue_aliases.py.
//
// "sponsors" are name prefixes stripped before any lookup.
// "aliases" map provider spellings of the SAME venue onto one canonical key.
// "families" collapse same-venue track variants (e.g. Sandown Hillside/Lakeside)
// onto one key for cross-source matching; two meetings that can race on the
// same day must never share a family.
export const VENUE_DATA = JSON.parse(`{
  "sponsors": ["sportsbet", "bet365", "ladbrokes", "tab", "aquispark"],
  "aliases": {
    "mtisa": "mountisa",
    "cannonpark": "cairns",
    "canterburypark": "canterbury",
    "southsidepakenham": "pakenham",
    "southsidecranbourne": "cranbourne",
    "alicesprings": "pioneerpark",
    "fanniebay": "darwin",
    "parkkilmore": "kilmore",
    "picklebetparkwodonga": "wodonga",
    "parkwodonga": "wodonga"
  },
  "families": {
    "sandownhillside": "sandown",
    "sandownlakeside": "sandown",
    "morphettvilleparks": "morphettville",
    "parkkyneton": "kyneton",
    "parkgoldcoast": "goldcoast",
    "rosehillgardens": "rosehill",
    "waggariverside": "wagga",
    "beaumontnewcastle": "newcastle"
  }
}`);

export const SPONSORS = VENUE_DATA.sponsors;
export const VENUE_ALIASES = VENUE_DATA.aliases;
export const VENUE_FAMILIES = VENUE_DATA.families;
