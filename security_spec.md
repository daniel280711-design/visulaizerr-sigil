# Security Specification: Sigil Viz Cloud Preset Storage

## 1. Data Invariants

1. **User Isolation**: A user can only access, create, query, update, and delete their own presets (`resource.data.userId == request.auth.uid`). No cross-user reads or modifications are ever permitted.
2. **Preset Schema Integrity**: Every preset written to Firestore must contain the required fields (`id`, `userId`, `name`, `c1`, `c2`, `c3`, `am`, `createdAt`, `updatedAt`) and can optionally include `presetType`, `shapeIndex`, and `fxPreset`. No unwhitelisted / shadow fields are accepted.
3. **Immutability of Identifiers & Timestamps**: The `id`, `userId`, and `createdAt` fields are strictly immutable once created. Any update attempting to modify `id`, `userId`, or `createdAt` is denied.
4. **Server Timestamp Enforcement**: `createdAt` on creation and `updatedAt` on creation and update must strictly equal `request.time`. Client-forged timestamps are rejected.
5. **Path and ID Hardening**: Document IDs and ID fields must conform to alphanumeric characters and dashes (`^[a-zA-Z0-9_\-]+$`) with a maximum length of 128 characters.
6. **Query Containment**: Collection queries must filter strictly by `userId == request.auth.uid` to prevent unauthorized document scraping.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: An unauthenticated user attempts to create a preset.
   - *Result*: PERMISSION_DENIED.
2. **Identity Spoofing**: An authenticated user (UID: `alice`) attempts to create a preset with `userId: 'bob'`.
   - *Result*: PERMISSION_DENIED.
3. **Shadow Field Injection**: A user attempts to save a preset containing an unauthorized ghost field `isAdmin: true` or `verified: true`.
   - *Result*: PERMISSION_DENIED.
4. **Forged Timestamp on Create**: A user submits a custom past/future timestamp string for `createdAt` instead of `request.time`.
   - *Result*: PERMISSION_DENIED.
5. **Id Poisoning (Oversized Document ID)**: An attacker uses a 2KB junk string as the document ID in the path.
   - *Result*: PERMISSION_DENIED (`isValidId` size bounds check fails).
6. **Cross-Tenant Read**: User `alice` attempts a `get` on a preset owned by user `bob` (`/presets/bob_preset_1`).
   - *Result*: PERMISSION_DENIED.
7. **Blanket Query Scrape**: An authenticated user queries `/presets` without filtering by `userId == request.auth.uid`.
   - *Result*: PERMISSION_DENIED (`allow list` evaluation fails).
8. **Owner Reassignment on Update**: User `alice` attempts to update their own preset to set `userId: 'charlie'`.
   - *Result*: PERMISSION_DENIED.
9. **Creation Timestamp Tampering on Update**: A user attempts to alter the `createdAt` timestamp during an update.
   - *Result*: PERMISSION_DENIED.
10. **Value Type Poisoning**: A user passes a boolean or an array instead of a hex color string for `c1`.
    - *Result*: PERMISSION_DENIED (`isValidPreset` type check fails).
11. **Oversized String Injection**: A user passes a 50,000 character string for `name` to cause Denial of Wallet storage bloat.
    - *Result*: PERMISSION_DENIED (`data.name.size() <= 100` check fails).
12. **Unauthorized Deletion**: User `alice` attempts to delete a preset belonging to user `bob`.
    - *Result*: PERMISSION_DENIED.
