---
title: std/time
sidebar_position: 2
---

# std/time

`std/time` ships a typed temporal API plus a small raw-integer
escape hatch. Five value types cover almost every app-level need:

- **`Instant`** — a moment on the global UTC timeline (int64
  nanoseconds since the Unix epoch). Independent of any timezone
  or calendar. Use for created_at timestamps, message ages,
  scheduled-job triggers — anywhere the answer to "when?" is a
  fixed point in physical time.
- **`Duration`** — a signed length of time (int64 nanoseconds).
  Use for timeouts, retry backoff, polling intervals — anywhere
  the answer to "how long?" is a span.
- **`Zone`** — an IANA timezone (`"UTC"`, `"Europe/Berlin"`,
  `"America/New_York"`) or a fixed UTC offset (`"+02:00"`).
  Needed to convert an `Instant` to a wall-clock reading.
- **`Date`** — a calendar date (year + month + day). No time of
  day, no zone. Use for birthdays, deadlines, calendar grids.
- **`DateTime`** — a wall-clock reading in a specific zone
  (`Instant` + `Zone`). The bridge between the physical timeline
  and the human calendar. Use for scheduled events, log
  timestamps shown to a user, "next Tuesday at 14:00 Berlin
  time".

All five travel across the wire as plain int64s / strings, so a
wired function returning `Instant` or `DateTime` reifies on both
sides without extra surgery.

## Quick start

```sova
import "std/time"

// Current moment as a typed Instant.
let now = time.instant()

// Convert to Berlin wall-clock time.
let berlin = time.zone("Europe/Berlin")!
let dt = now.inZone(berlin)
println(dt.format("dd.MM.yyyy HH:mm:ss"))
//=> 16.06.2026 14:30:00

// Is summer time currently active in Berlin?
if dt.isDST() {
    println("Sommerzeit")  // CEST, +02:00
}

// Parse a German-formatted timestamp.
let parsed = time.parseDateTimeExact(
    "16.06.2026 14:30:00",
    "dd.MM.yyyy HH:mm:ss",
    berlin,
)!

// Date arithmetic.
let today = time.today()
let nextWeek = today.plusDays(7)
println(nextWeek.toISO())   //=> 2026-06-23
println(today.daysUntil(nextWeek))  //=> 7

// Timeouts and durations.
let timeout = time.seconds(5)
let deadline = time.instant().plus(timeout)
```

## Instant

A point on the global UTC timeline.

```sova
type Instant {
    nanos: int = 0
}
```

### Constructors

```sova
let now    = time.instant()                       // current moment
let epoch  = time.fromUnix(1718553600)            // from seconds
let epochMs = time.fromUnixMillis(1718553600_000) // from millis
let epochNs = time.fromUnixNanos(1718553600_000_000_000)

// ISO 8601 / RFC 3339 — returns option<Instant>.
let parsed = time.parse("2026-06-16T12:34:56Z")        // option<Instant>
let withOffset = time.parse("2026-06-16T14:34:56+02:00")
```

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.unix()` | `int` | Whole Unix seconds. |
| `.unixMillis()` | `int` | Whole milliseconds. |
| `.unixNanos()` | `int` | Raw nanoseconds. |
| `.toISO()` | `string` | RFC 3339 / ISO 8601, UTC, full nanosecond precision (backend) or millisecond (frontend). |
| `.plus(d: Duration)` | `Instant` | Shifted forward by `d`. |
| `.minus(d: Duration)` | `Instant` | Shifted backward. |
| `.diff(other: Instant)` | `Duration` | Signed; positive when receiver is later. |
| `.isBefore(o)` / `.isAfter(o)` / `.equals(o)` | `bool` | Strict comparisons. |
| `.inZone(z: Zone)` | `DateTime` | Project into a zone's wall-clock. |
| `.date(z: Zone)` | `Date` | Calendar date in a zone (shortcut for `.inZone(z).date()`). |

### Frontend precision caveat

JavaScript's `Date` is millisecond-precise. Nanos below the
millisecond floor are dropped when crossing a wire boundary —
`instant()` on the frontend yields `<ms> * 1_000_000`, with the
bottom six zeros tracking only what the host platform supports.
Backend code keeps full nanosecond precision.

## Duration

A signed length of time.

```sova
type Duration {
    nanos: int = 0
}
```

### Constructors

```sova
let oneSec     = time.seconds(1)
let oneMs      = time.millis(1)
let oneNs      = time.nanos(1)
let oneMinute  = time.minutes(1)
let oneHour    = time.hours(1)
let oneDay     = time.days(1)        // see DST caveat below
let elapsed    = time.between(start, end)   // = end.diff(start)
```

#### DST caveat for `days(n)`

`days(n)` is a pure nanosecond count (`n * 86_400_000_000_000`).
Adding `days(1)` to an `Instant` across a DST transition (e.g.
last Sunday in March in Europe) puts you an hour off the same
wall-clock time. When you mean "same time tomorrow", prefer
`Date.plusDays(1).atStartOfDay(zone)` plus your time-of-day, or
work with `DateTime` directly. When you mean "advance by exactly
86,400,000,000,000 nanos regardless of clock shifts", `days(n)`
is the helper you want.

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.asSeconds()` | `float` | Fractional. `2.5s → 2.5`. |
| `.asMillis()` | `int` | Truncated toward zero. |
| `.asNanos()` | `int` | Raw count. |
| `.inSeconds/Minutes/Hours()` | `int` | Whole units, truncated. |
| `.plus(o)` / `.minus(o)` | `Duration` | No mutation. |
| `.isZero()` / `.isNegative()` | `bool` | |

## Zone

An IANA timezone or fixed UTC offset.

```sova
type Zone {
    name: string = "UTC"
}
```

### Constructors

```sova
let utc    = time.utc()
let local  = time.localZone()    // host's local zone
let berlin = time.zone("Europe/Berlin")!   // option<Zone>
let tokyo  = time.zone("Asia/Tokyo")!
let off    = time.zone("+02:00")!          // fixed-offset zone
```

`zone(name)` returns `none` for unknown identifiers. Fixed-offset
spellings (`"+02:00"`, `"-05:30"`) are accepted and treated as
non-DST-observing.

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.equals(o)` | `bool` | Compares names. Fixed-offset zones never equal IANA zones, even when offsets match. |
| `.offsetAt(i: Instant)` | `Duration` | UTC offset in effect at `i`. CEST → `seconds(7200)`, CET → `seconds(3600)`. |
| `.isDSTAt(i: Instant)` | `bool` | True iff DST currently in effect. |
| `.observesDST(year: int)` | `bool` | True iff this zone has DST rules for the given year. `UTC` / fixed-offset zones → `false`. |

## Date

A calendar date.

```sova
type Date {
    year: int = 1970
    month: int = 1   // 1-12 (NOT 0-11 like JS Date)
    day: int = 1     // 1-31
}
```

### Constructors

```sova
let d   = time.today()                       // today in UTC
let dB  = time.todayIn(berlin)               // today in Berlin
let dm  = time.dateOf(2026, 6, 16)           // explicit
let par = time.parseDate("2026-06-16")!      // option<Date>, ISO yyyy-MM-dd

// Custom format — see the formatter section below.
let de  = time.parseDateExact("16.06.2026", "dd.MM.yyyy")!
```

### Methods

| Method | Returns | Notes |
| --- | --- | --- |
| `.toISO()` | `string` | `2026-06-16` (zero-padded). |
| `.weekday()` | `int` | 0 = Sunday … 6 = Saturday. |
| `.plusDays(n)` / `.plusMonths(n)` / `.plusYears(n)` | `Date` | Month-end clamping matches Go's `AddDate`. |
| `.daysUntil(other)` | `int` | Positive when `other` is later. |
| `.isBefore(o)` / `.isAfter(o)` / `.equals(o)` | `bool` | |
| `.atStartOfDay(z: Zone)` | `Instant` | Midnight of this date in the given zone. |
| `.format(pattern)` | `string` | Pattern-based, see below. |

## DateTime

Wall-clock reading in a specific zone — the bridge between
`Instant` and `Date`.

```sova
type DateTime {
    nanos: int = 0      // underlying UTC nanos
    zoneName: string = "UTC"
}
```

### Constructors

```sova
// Most common: project an Instant into a zone.
let dt = time.instant().inZone(berlin)

// Build from broken-down parts (option — returns none on unknown zone).
let dt = time.dateTimeOf(2026, 6, 16, 14, 30, 0, 0, "Europe/Berlin")!

// Parse ISO with offset suffix.
let dt = time.parseDateTime("2026-06-16T14:34:56+02:00")!

// Custom format with caller-supplied zone.
let dt = time.parseDateTimeExact("16.06.2026 14:30:00", "dd.MM.yyyy HH:mm:ss", berlin)!
```

### Accessors

Each computes on demand via the host calendar so the answers
stay internally consistent:

| Method | Returns |
| --- | --- |
| `.year()` `.month()` `.day()` | `int` (month 1-12, day 1-31) |
| `.hour()` `.minute()` `.second()` `.nano()` | `int` |
| `.weekday()` | `int` (0 = Sunday … 6 = Saturday) |
| `.date()` | `Date` |
| `.zone()` | `Zone` |
| `.instant()` | `Instant` (zone metadata dropped) |

### Summer time / DST

| Method | Returns | Notes |
| --- | --- | --- |
| `.isDST()` | `bool` | True iff zone is observing DST at this moment. `Europe/Berlin` in July → `true`; in January → `false`; `UTC` → always `false`. |
| `.offset()` | `Duration` | UTC offset in effect at this moment. `seconds(7200)` for CEST, `seconds(3600)` for CET. |

The DST detection is hemisphere-agnostic — it compares the
zone's offset at this moment to its offsets at January-15 and
July-15 of the same year, so southern-hemisphere zones (where
"summer" is December-February) report correctly.

### Arithmetic

| Method | Returns | Notes |
| --- | --- | --- |
| `.plus(d)` / `.minus(d)` | `DateTime` | Operates on the underlying nanos; same as `.instant().plus(d).inZone(.zone())`. For "next Tuesday at the same wall-clock time", use `Date.plusDays(7)` so DST shifts don't move the clock by an hour. |
| `.withZone(z)` | `DateTime` | Re-project into a different zone. Same moment, different reading. |
| `.toISO()` | `string` | RFC 3339 with offset suffix (`...+02:00` or `...Z`). |
| `.isBefore(o)` / `.isAfter(o)` / `.equals(o)` | `bool` | Comparison is by underlying nanoseconds — same moment in different zones reads NOT equal via `.equals` (use `.instant().equals(...)` for moment-level equality). |

## Pattern-based format and parse

Both `Date.format(pattern)` and `DateTime.format(pattern)` use
the same token language, which is the Java / `DateTimeFormatter`
convention. The parser functions (`parseDateExact`,
`parseDateTimeExact`) accept the same tokens.

### Tokens

| Token | Output / matches |
| --- | --- |
| `yyyy` | 4-digit year (`2026`) |
| `yy` | 2-digit year, last two (`26`) |
| `MM` | 2-digit month, `01`-`12` |
| `M` | 1-2 digit month, `1`-`12` |
| `dd` | 2-digit day, `01`-`31` |
| `d` | 1-2 digit day, `1`-`31` |
| `HH` | 2-digit hour, 24h, `00`-`23` |
| `H` | 1-2 digit hour, 24h |
| `mm` | 2-digit minute, `00`-`59` |
| `m` | 1-2 digit minute |
| `ss` | 2-digit second, `00`-`59` |
| `s` | 1-2 digit second |
| `SSS` | 3-digit millisecond, `000`-`999` |

Anything else passes through verbatim, so the German shape
`dd.MM.yyyy HH:mm:ss` reads as `16.06.2026 14:30:00`. The
formatter renders in the DateTime's own zone — call
`.withZone(...)` first to format in a different one.

### Format examples

```sova
let dt = time.instant().inZone(berlin)

dt.format("dd.MM.yyyy")                    //=> 16.06.2026
dt.format("yyyy-MM-dd HH:mm:ss")           //=> 2026-06-16 14:30:00
dt.format("yyyy-MM-dd HH:mm:ss.SSS")       //=> 2026-06-16 14:30:00.123
dt.format("d. M. yy")                      //=> 16. 6. 26

let d = time.today()
d.format("dd.MM.yyyy")                     //=> 16.06.2026
d.format("yyyy/MM/dd")                     //=> 2026/06/16
```

### Parse examples

```sova
// Returns option<Date>.
let d = time.parseDateExact("16.06.2026", "dd.MM.yyyy")
let d2 = time.parseDateExact("2026/06/16", "yyyy/MM/dd")

// Returns option<DateTime> — caller provides the zone.
let dt = time.parseDateTimeExact(
    "16.06.2026 14:30:45",
    "dd.MM.yyyy HH:mm:ss",
    berlin,
)
```

Invalid input returns `none` rather than throwing. The parser is
strict: extra whitespace or trailing characters cause a mismatch.

### What's NOT a token

Locale-aware month / weekday names (`Juni`, `Mittwoch`,
`June`, `Wednesday`) are deliberately not in the token language
yet — they reach into the `Intl.DateTimeFormat` rabbit hole.
Planned as a follow-up once a concrete use case lands. For now
you can compose them by hand:

```sova
let monthNamesDe = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]
let label = "${dt.day()}. ${monthNamesDe[dt.month() - 1]} ${dt.year()}"
```

## Raw integer escape hatch

For interop with code that speaks raw Unix integers — `gorm`
columns, log lines, query parameters — the legacy free functions
are preserved:

| Function | Returns | Notes |
| --- | --- | --- |
| `time.now()` | `int` | Unix seconds. |
| `time.unixMillis()` | `int` | Unix milliseconds. |
| `time.unixNano()` | `int` | Unix nanoseconds (backend full precision; frontend `Date.now() * 1e6`). |

New code should reach for `time.instant()` and the typed handles
above; these stay around so existing call sites keep working
without breaking changes.
