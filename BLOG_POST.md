# Maginet: Playing Magic With Friends Without a Rules Engine

I wanted to play Magic: The Gathering with my friends online. The obvious path was to build a full rules engine, but Magic is famously complex with a massive card pool. Trying to encode all of that would be a multi-year project, and I did not want to ship a half-simulation that still felt wrong.

So I made a different decision: instead of modeling rules, I built a shared table, and I wanted it to be browser-based. The core concept is directly inspired by Tabletop Simulator. A flexible shared surface where players can play together.

Try the app: https://maginet-2.vercel.app/
Repo: https://github.com/reifocS/maginet

---

## The core decision: minimal vocabulary, no rules engine

If I tried to simulate the rules, I would have to become the arbiter of correctness. That is a bad fit for Magic, which evolves constantly and lives in edge cases. I wanted the opposite: a tool that supports play without dictating it.

If you do want a full rules engine, there are excellent projects like Forge (https://github.com/Card-Forge/forge) that go deep on simulation. Maginet is deliberately a different approach.

So I asked what the minimal, sufficient vocabulary for play really is:

- A shared surface to manipulate together.
- A way to move cards and tokens freely.
- The ability to annotate and improvise.
- Realtime sync without heavy infrastructure.

That vocabulary only works if the space itself is flexible. An infinite canvas means nothing is locked into predefined zones, and simple primitives can take on meaning through arrangement. No hard-coded battlefield, no stack UI. Just a shared surface where players can create the structure they need.

## Peer-to-peer sync keeps it light

Maginet uses PeerJS for direct browser-to-browser connections. Each player shares a peer ID and connects in a mesh. There is no backend room service. If you can connect to a friend, you can play.

When a new peer connects, the current board state is sent as a snapshot. After that, changes are streamed in realtime.

The connection setup is intentionally small and explicit:

- On startup, each browser creates a PeerJS identity and announces itself.
- When a connection opens, the peer registers it, sends a "peer-sync" message with other known peers, and immediately pushes a "connected" notice plus a board snapshot to the newcomer.
- When data arrives, the receiver handles "peer-sync" to auto-connect to the rest of the mesh, then routes the remaining messages by type.

That means there is no "host" and no central authority. Everyone ends up with the same live list of connections, and everyone can broadcast updates.

The shared state is just shapes. The sync model is intentionally simple: a list of shapes, broadcast and merged on every peer.

---

## Closing

If you are building for a complex domain, consider this question: do you need to encode every rule, or can you empower users with the right primitives and a shared space?

Sometimes the best engine is no engine at all.
