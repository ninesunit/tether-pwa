# Tether — System Design & Visual Architecture

Paste either block into [PlantText](https://www.planttext.com/) to render.

## 1. Relational Database Schema (ERD)

```plantuml
@startuml
!theme plain
hide circle
skinparam linetype ortho

entity "auth.users\n(Supabase managed)" as users {
  * id : uuid <<PK>>
  --
  email : text
  encrypted_password : text
}

entity "profiles" as profiles {
  * id : uuid <<PK, FK -> auth.users.id>>
  --
  display_name : text
  created_at : timestamptz
}

entity "tethers" as tethers {
  * id : uuid <<PK>>
  --
  code : text <<UNIQUE>>  ' one-time pairing code
  * partner_a : uuid <<FK -> profiles.id>>
  partner_b : uuid <<FK -> profiles.id, NULL until paired>>
  created_at : timestamptz
}

entity "letters" as letters {
  * id : uuid <<PK>>
  --
  * tether_id : uuid <<FK -> tethers.id>>
  * sender_id : uuid <<FK -> profiles.id>>
  body : text
  unlock_at : timestamptz  ' now() + 30 min
  created_at : timestamptz
}

entity "memories" as memories {
  * id : uuid <<PK>>
  --
  * tether_id : uuid <<FK -> tethers.id>>
  * uploader_id : uuid <<FK -> profiles.id>>
  storage_path : text  ' Supabase Storage key
  caption : text
  rotation : real  ' shared polaroid tilt
  hearted : boolean
  created_at : timestamptz
}

entity "daily_questions" as questions {
  * id : uuid <<PK>>
  --
  * tether_id : uuid <<FK -> tethers.id>>
  prompt : text
  for_date : date  ' UNIQUE(tether_id, for_date)
  created_at : timestamptz
}

entity "question_answers" as answers {
  * id : uuid <<PK>>
  --
  * question_id : uuid <<FK -> daily_questions.id>>
  * author_id : uuid <<FK -> profiles.id>>
  body : text  ' RLS: blind until both answered
  created_at : timestamptz
}

entity "tokens" as tokens {
  * id : uuid <<PK>>
  --
  * tether_id : uuid <<FK -> tethers.id>>
  * sender_id : uuid <<FK -> profiles.id>>
  title : text
  note : text
  redeemed_at : timestamptz  ' NULL = still spendable
  created_at : timestamptz
}

entity "goals" as goals {
  * id : uuid <<PK>>
  --
  * tether_id : uuid <<FK -> tethers.id>>
  title : text
  target : integer
  progress : integer  ' atomic RPC increment
  completed_at : timestamptz
  created_at : timestamptz
}

users ||--|| profiles
profiles ||--o{ tethers : "partner_a"
profiles |o--o{ tethers : "partner_b"
tethers ||--o{ letters
tethers ||--o{ memories
tethers ||--o{ questions
tethers ||--o{ tokens
tethers ||--o{ goals
questions ||--o{ answers
profiles ||--o{ answers : "author"
@enduml
```

**Privacy invariant:** every content table carries `tether_id`; all RLS
policies route through `is_tether_member(tether_id)`, so a couple's rows are
invisible to any other authenticated user. The "blind answer" rule is enforced
in the database (`answers select blind` policy), not just the UI.

## 2. Component Tree & Realtime Data Flow

```plantuml
@startuml
!theme plain
skinparam componentStyle rectangle

package "Supabase Cloud" {
  [PostgreSQL + RLS] as PG
  [Realtime: Presence] as PRES
  [Realtime: Broadcast] as BCAST
  [Realtime: postgres_changes] as PGC
  [Storage: memories bucket] as STOR
  [Auth] as AUTH
}

package "React App" {
  [main.tsx\n(registerSW)] as MAIN
  [App] as APP
  [TetherProvider\n(TetherContext)] as CTX
  [AmbientBackground\n(mesh gradient)] as BG
  [Router (phase machine)\nloading → signed-out → unpaired → paired] as ROUTER
  [AuthScreen] as AUTHS
  [PairingScreen] as PAIR
  package "PairedApp (swipe pager)" {
    [PulseScreen] as PULSE
    [InboxScreen] as INBOX
    [MemoriesScreen] as MEM
    [BridgeScreen] as BRIDGE
    [TokensScreen] as TOK
    [PathScreen] as PATH
  }
  [haptics.ts\nhidden <input switch>] as HAP
}

MAIN --> APP
APP --> CTX
CTX --> ROUTER
CTX --> BG : ambience\n(dormant/present/near)
ROUTER --> AUTHS
ROUTER --> PAIR
ROUTER --> PULSE

CTX <--> AUTH : session
CTX <--> PG : profiles, tethers
CTX <--> PRES : track({lat,lng}) / sync\n→ partnerOnline, partnerNear
CTX <--> BCAST : send/receive "pulse"
CTX --> HAP : haptic("pulse") on receive

PULSE --> CTX : sendPulse()
INBOX <--> PG : letters (30-min unlock)
INBOX <-- PGC : INSERT letters
MEM <--> PG : memories rows
MEM <--> STOR : upload / public URL
MEM <-- PGC : * memories
BRIDGE <--> PG : daily_questions, answers
BRIDGE <-- PGC : INSERT answers
TOK <--> PG : tokens mint/redeem
TOK <-- PGC : * tokens
TOK --> CTX : sendPulse() on redeem
PATH <--> PG : goals + increment_goal RPC
PATH <-- PGC : UPDATE goals
@enduml
```

**Realtime budget (free tier):** one Presence/Broadcast channel per couple
(`tether:{id}`), plus per-screen `postgres_changes` subscriptions that mount
only while their screen is visible. Pulses are pure Broadcast — zero database
writes.

**Ambience state machine:** `dormant` (partner offline, cool slate) →
`present` (partner's presence key visible, warm amber) → `near` (both clients
report coordinates within 250 m, glowing blush). Transitions are 3.5 s
color-tweened by Framer Motion in `AmbientBackground`.
