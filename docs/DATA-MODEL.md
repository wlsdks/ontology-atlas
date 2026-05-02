---
title: Data Model
tags: [data-model, firestore, schema]
---

# Data Model

> This document covers the storage contracts of both the current public product and the design-approved `knowledge subsystem v2`. Whenever a collection schema changes, update this document first. The change process follows [`rules/firestore-schema.md`](rules/firestore-schema.md).
>
> **Single-user mode (current):** A single logged-in user is the owner of their own workspace. There is no account / membership concept. All collections live at the root path. If multi-account support becomes necessary during the v2 collaboration phase, it will be introduced via a separate ADR.

## 1. Principles

1. The canonical data of the current public product is still `projects`.
2. The knowledge subsystem is introduced as an authentication-required subsystem, separate from the public product.
3. The canonical graph of the knowledge subsystem is stored in a private store, and public surfaces read only from a projection.
4. Raw markdown is stored in Firebase Storage, not in Firestore.
5. Backend-owned collections are not written to directly by browser clients.
6. Relational contracts in `database/ddl/postgres/` are kept in sync as preparation for a potential PostgreSQL/Prisma migration.

## 2. Firestore collections

```text
firestore/
├── projects/                        public canonical
│   └── {slug}/
├── categories/                      public config
│   └── {id}/
├── statuses/                        public config
│   └── {id}/
├── meta/
│   └── site/
├── knowledgeDocuments/              private document headers
│   └── {documentId}/
├── knowledgeDocumentVersions/       private source-text versions
│   └── {versionId}/
├── knowledgeDocumentChunks/         ⚠️ cold storage (read-only after mission v2 cleanup)
│   └── {chunkId}/
├── knowledgeEvidence/               ⚠️ cold storage (mission v2 cleanup)
│   └── {evidenceId}/
├── knowledgeExtractionJobs/         ⚠️ cold storage (extraction handler removed, PR #5)
│   └── {jobId}/
├── knowledgeExtractionOutputs/      ⚠️ cold storage (extraction handler removed)
│   └── {outputId}/
├── knowledgeReviews/                ⚠️ cold storage (applyReviewAction removed, PR #6)
│   └── {reviewId}/
├── knowledgeReviewEvents/           ⚠️ cold storage
│   └── {eventId}/
├── knowledgeApprovalEvents/         ⚠️ cold storage
│   └── {eventId}/
├── knowledgeApprovedNodes/          private canonical graph
│   └── {nodeId}/
├── knowledgeApprovedEdges/          private canonical graph
│   └── {edgeId}/
├── knowledgePublishes/              backend-owned, authed readable
│   └── {publishId}/
├── knowledgePublicMeta/             public projection pointer
│   └── current/
├── knowledgePublicNodes/            public projection
│   └── {nodeId}/
├── knowledgePublicEdges/            public projection
│   └── {edgeId}/
├── ontologyClasses/                 ontology TBox — node class definitions (authed write, public read)
│   └── {classId}/
├── ontologyRelations/               ontology TBox — relation type definitions (authed write, public read)
│   └── {relationId}/
├── ontologyTBoxVersions/            ontology TBox snapshot (immutable, append-only)
│   └── {versionId}/
└── ontologyTBoxState/               active TBox version pointer
    └── current/                     versionId + activatedAt + activatedBy
```

## 3. Public product collections

### `projects/{slug}`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `slug` | string | ✅ | URL-friendly kebab-case; identical to the document ID |
| `name` | string | ✅ | Korean name |
| `nameEn` | string |  | English name |
| `category` | string | ✅ | Reference to `categories/{id}` |
| `status` | string | ✅ | Reference to `statuses/{id}` |
| `description` | string | ✅ | One- or two-line summary |
| `detail` | string (markdown) |  | Long-form body |
| `tags` | string[] |  | Tag array |
| `stack` | string[] |  | Tech stack |
| `links` | `Array<{ label: string; url: string }>` |  | External links |
| `dependencies` | string[] |  | Array of dependent project slugs |
| `owner` | string |  | Owner |
| `icon` | string |  | Emoji or URL |
| `screenshots` | string[] |  | Array of Storage URLs |
| `timeline.startedAt` | Timestamp |  | Start date |
| `timeline.launchedAt` | Timestamp |  | Launch date |
| `progress` | number (0-100) |  | Progress |
| `isHub` | boolean | ✅ | Whether the node is a hub |
| `position.x` | number | ✅ | Topology layout coordinate X |
| `position.y` | number | ✅ | Topology layout coordinate Y |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |

### `categories/{id}`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Identical to the document ID |
| `label` | string | ✅ | Korean label |
| `labelEn` | string |  | English label |
| `order` | number | ✅ | Sort order |
| `position.x` | number | ✅ | Cluster center X |
| `position.y` | number | ✅ | Cluster center Y |
| `size.width` | number | ✅ | Cluster width |
| `size.height` | number | ✅ | Cluster height |
| `radius` | number | ✅ | Radius used for navigation zoom calculation |
| `borderStyle` | `"underline" \| "dashed" \| "sideLabel" \| "solid"` | ✅ | Category border representation |
| `sideLabelText` | string |  | Left-side label when `sideLabel` is used |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |

### `statuses/{id}`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Identical to the document ID |
| `label` | string | ✅ | Korean label |
| `labelEn` | string |  | English label |
| `order` | number | ✅ | Sort order |
| `dotColor` | `"success" \| "warning" \| "paused" \| "neutral"` | ✅ | Status-dot color preset |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |

### `meta/site`

| Field | Type | Description |
| --- | --- | --- |
| `title` | string | Site title |
| `description` | string | Site description |
| `lastUpdated` | Timestamp | Last change time |
| `viewCount` | number | Visit count (optional) |

## 4. Knowledge subsystem collections

> **Mission v2 status (2026-05-01)**: Most collections in this section are **cold storage** — they are documented for historical accuracy and any rows that already exist remain queryable, but no UI surface or callable currently writes them. The collections that are still live (post-mission-v2) are the ones backing the manual builder + public projection: `knowledgeApprovedNodes` / `knowledgeApprovedEdges` / `knowledgePublishes` / `knowledgePublicNodes` / `knowledgePublicEdges` / `knowledgePublicMeta`. Everything else (`knowledgeDocuments`, `knowledgeDocumentVersions`, `knowledgeDocumentChunks`, `knowledgeExtractionJobs/Outputs`, `knowledgeEvidence`, `knowledgeReviews/ReviewEvents/ApprovalEvents`) is read-only after the mission v2 cleanup that retired the `/knowledge/*` route surface, the cloud LLM extraction flow, and the `/review/*` queue.

### `knowledgeDocuments/{documentId}`

Admin-private entry that holds the document header and current state.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Document ID |
| `title` | string | ✅ | Current canonical title |
| `kind` | string | ✅ | Current canonical document kind |
| `projectIds` | string[] | ✅ | List of linked project slugs |
| `sourceType` | `"upload" \| "manual" \| "import"` | ✅ | Creation path |
| `currentVersionId` | string | ✅ | Current reference version ID |
| `formatScore` | number |  | Specification conformance score |
| `status` | `"draft" \| "ready" \| "processing" \| "reviewing" \| "published" \| "error"` | ✅ | Document operational state |
| `latestJobStatus` | string |  | Summary of the latest extraction job status |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |
| `createdBy` | string | ✅ | Email of the creating admin |

`knowledgeDocuments` carries the derived header for `currentVersionId`. `title`, `kind`, and `projectIds` reflect the version's canonical metadata.

### `knowledgeDocumentVersions/{versionId}`

Source-text version metadata. Treated as append-only.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Version ID |
| `documentId` | string | ✅ | Parent document ID |
| `title` | string | ✅ | Version metadata title |
| `kind` | string | ✅ | Version metadata kind |
| `projectIds` | string[] | ✅ | Version metadata project links |
| `frontmatter` | map |  | Parsed frontmatter |
| `storagePath` | string | ✅ | Storage path of the source text |
| `mimeType` | string | ✅ | `text/markdown` or another allowed MIME type |
| `sizeBytes` | number | ✅ | Source-text size |
| `hash` | string | ✅ | Version hash |
| `createdAt` | Timestamp | ✅ | Created at |
| `createdBy` | string | ✅ | Email of the creating admin |

### `knowledgeDocumentChunks/{chunkId}`

Chunk index produced by the trusted backend.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Chunk ID |
| `documentId` | string | ✅ | Document ID |
| `documentVersionId` | string | ✅ | Reference version ID |
| `headingPath` | string[] |  | Heading path |
| `markdown` | string | ✅ | Chunk markdown |
| `charStart` | number | ✅ | Source-text start offset |
| `charEnd` | number | ✅ | Source-text end offset |
| `chunkHash` | string | ✅ | Hash of the chunk content |
| `createdAt` | Timestamp | ✅ | Created at |

### `knowledgeExtractionJobs/{jobId}`

Job queue entry. The admin UI requests an enqueue, and the actual job document is created and processed by the trusted backend.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Job ID |
| `documentId` | string | ✅ | Target document ID |
| `documentVersionId` | string | ✅ | Target version ID |
| `extractorVersion` | string | ✅ | Extractor version |
| `idempotencyKey` | string | ✅ | Idempotency key, derived from `(documentVersionId, extractorVersion)` |
| `status` | `"queued" \| "leased" \| "processing" \| "succeeded" \| "failed" \| "superseded"` | ✅ | Status |
| `attemptCount` | number | ✅ | Number of attempts |
| `maxAttempts` | number | ✅ | Maximum allowed attempts |
| `retryable` | boolean | ✅ | Whether retry is allowed |
| `nextAttemptAt` | Timestamp |  | Next allowed retry time |
| `leaseOwner` | string |  | Identifier of the worker currently processing the job |
| `leaseExpiresAt` | Timestamp |  | Lease expiration time |
| `generation` | number | ✅ | Lease generation; prevents stale completions |
| `errorCode` | string |  | Last error code |
| `errorMessage` | string |  | Last error message |
| `supersededByJobId` | string |  | ID of the superseding job |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |
| `requestedBy` | string | ✅ | Email of the admin who enqueued the job |

Wherever possible, `jobId` uses a deterministic ID derived from `idempotencyKey`. Browsers do not create duplicate jobs directly; they request one through the backend enqueue boundary.

### `knowledgeExtractionOutputs/{outputId}`

Raw extraction results stored by the trusted backend.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Output ID |
| `jobId` | string | ✅ | ID of the job that produced this output |
| `documentId` | string | ✅ | Document ID |
| `documentVersionId` | string | ✅ | Document version ID |
| `extractorVersion` | string | ✅ | Extractor version |
| `provider` | string | ✅ | e.g., `gemini` |
| `summary` | string |  | Document summary |
| `nodes` | `OutputNode[]` | ✅ | Candidate node list (sub-schema below) |
| `edges` | `OutputEdge[]` | ✅ | Candidate edge list (sub-schema below) |
| `warnings` | string[] |  | List of warnings |
| `createdAt` | Timestamp | ✅ | Created at |

`OutputNode` sub-schema:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `tempId` | string | ✅ | Output-internal temporary ID; mapped to a canonical node ID on approval |
| `title` | string | ✅ | Node title |
| `kind` | string | ✅ | Legal value from `ontologyClasses` (project / domain / capability / element / document) |
| `projectIds` | string[] | ✅ | Linked projects |
| `summary` | string |  | Internal summary |
| `confidence` | number | ✅ | LLM confidence 0–1. Pending-spec §6.3 policy: `≥ 0.85` auto-approval candidate / `0.60–0.84` requires review / `< 0.60` cannot be applied automatically |
| `warnings` | string[] |  | Per-candidate warnings |

`OutputEdge` sub-schema:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `tempId` | string | ✅ | Output-internal temporary ID |
| `fromTempId` | string | ✅ | tempId of the source node |
| `toTempId` | string | ✅ | tempId of the target node |
| `type` | `KnowledgeEdgeType` | ✅ | One of 7 enum values (T-2). Aligned with the `ontologyRelations` collection |
| `label` | string |  | Display label for the UI |
| `confidence` | number | ✅ | LLM confidence 0–1; same policy as nodes |

> **Confidence policy (pending-spec §6.3 adopted)**:
> - `≥ 0.85` — high. Conformant document with explicit relations. Auto-approval candidate.
> - `0.60 – 0.84` — medium. Likely from context. Routed to the review queue.
> - `< 0.60` — low. Cannot be applied automatically. Requires explicit user approval.

### `knowledgeEvidence/{evidenceId}`

Immutable evidence reference store.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Evidence ID |
| `documentId` | string | ✅ | Document ID |
| `documentVersionId` | string | ✅ | Version ID |
| `versionHash` | string | ✅ | Version hash |
| `chunkId` | string | ✅ | Chunk ID |
| `chunkHash` | string | ✅ | Chunk hash |
| `charStart` | number | ✅ | Source-text start position |
| `charEnd` | number | ✅ | Source-text end position |
| `excerpt` | string | ✅ | Quoted text for display |
| `locatorVersion` | string | ✅ | Locator computation version |
| `extractorVersion` | string | ✅ | Extractor version |
| `sourceOutputId` | string | ✅ | ID of the extraction output that produced this evidence |
| `createdAt` | Timestamp | ✅ | Created at |

### `knowledgeReviews/{reviewId}`

Review entries for operators.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Review ID |
| `documentId` | string | ✅ | Related document ID |
| `documentVersionId` | string | ✅ | Related version ID |
| `jobId` | string |  | Related job ID |
| `type` | `"document-batch" \| "merge" \| "low-confidence"` | ✅ | Review bucket |
| `status` | `"open" \| "approved" \| "rejected" \| "snoozed" \| "superseded"` | ✅ | Status |
| `payload` | map | ✅ | Review target data |
| `assignedTo` | string |  | Email of the assigned admin |
| `createdAt` | Timestamp | ✅ | Created at |
| `updatedAt` | Timestamp | ✅ | Updated at |

### `knowledgeReviewEvents/{eventId}`

Append-only events for review audit trails.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Event ID |
| `reviewId` | string | ✅ | Target review ID |
| `documentId` | string | ✅ | Related document ID |
| `action` | string | ✅ | e.g., `approve`, `reject`, `snooze`, `comment` |
| `actor` | string | ✅ | Actor email |
| `fromStatus` | string |  | Previous status |
| `toStatus` | string | ✅ | New status |
| `decisionPayload` | map |  | Decision details |
| `comment` | string |  | Operations note |
| `createdAt` | Timestamp | ✅ | Created at |

### `knowledgeApprovalEvents/{eventId}`

Change history for the approved graph.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Event ID |
| `entityType` | `"node" \| "edge"` | ✅ | Target type |
| `entityId` | string | ✅ | Target canonical ID |
| `reviewId` | string |  | Source review ID |
| `before` | map |  | Snapshot before the change |
| `after` | map | ✅ | Snapshot after the change |
| `approvedBy` | string | ✅ | Approver email |
| `approvedAt` | Timestamp | ✅ | Approval time |
| `revertsEventId` | string |  | ID of the event being rolled back |

### `knowledgeApprovedNodes/{nodeId}`

Knowledge canonical node store. Admin-private and the input to publish.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Node ID. For ontology extraction, the format is `<kind>:<frontmatterId>` (id-resolution.md §1) |
| `title` | string | ✅ | Canonical title |
| `kind` | string | ✅ | Node kind. Legal value from `ontologyClasses`. `unknown` = stub placeholder |
| `projectIds` | string[] | ✅ | Linked projects. Stubs are an empty array |
| `parentId` | string |  | Canonical hierarchy parent |
| `summary` | string |  | Internal summary |
| `evidenceIds` | string[] | ✅ | List of identifiers backing the approval |
| `currentRevisionId` | string |  | Most recent approval event ID |
| `lastApprovedAt` | Timestamp | ✅ | Time of the most recent approval |
| `lastApprovedBy` | string | ✅ | Email of the most recent approving admin |
| `isStub` | boolean |  | When true, a placeholder. Surfaced separately in the review queue (id-resolution.md §2) |
| `pendingType` | string |  | When stub, the edge type declared in frontmatter; used to restore the edge on promote |
| `pendingFromId` | string |  | When stub, the source canonical ID to restore on promote |
| `source` | `"manual" \| "extraction"` |  | Origin. Legacy data is `undefined` (the UI treats it as `extraction`). Manual editor v0 (B-line) onward, user-authored = `"manual"` |
| `manualAuthor` | string |  | When `source === "manual"`, the author's uid. Firestore rules allow update/delete only by the author |
| `manualNote` | string |  | When `source === "manual"`, an optional free-form note from the author |
| `tboxVersionId` | string |  | (P1 Phase 1) Active TBox version ID at the time this node was created/reviewed (`ontologyTBoxVersions/{versionId}`). Legacy = undefined → loader treats as `legacy-v0` |

### `knowledgeApprovedEdges/{edgeId}`

Knowledge canonical edge store. Admin-private and the input to publish.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Edge ID |
| `from` | string | ✅ | Source node ID |
| `to` | string | ✅ | Target node ID |
| `type` | `"contains" \| "belongs_to" \| "depends_on" \| "implements" \| "uses" \| "describes" \| "related_to"` | ✅ | Relation type. Aligned with the 7 entries of the ontology TBox `ontologyRelations`. Categories: `contains`/`belongs_to` = structure, `depends_on`/`implements`/`uses` = behavior, `describes` = evidence, `related_to` = weak. The source of truth for legal values is the `ontologyRelations` collection. |
| `projectIds` | string[] | ✅ | Linked projects |
| `evidenceIds` | string[] | ✅ | List of identifiers backing the approval |
| `currentRevisionId` | string |  | Most recent approval event ID |
| `lastApprovedAt` | Timestamp | ✅ | Time of the most recent approval |
| `lastApprovedBy` | string | ✅ | Email of the most recent approving admin |
| `source` | `"manual" \| "extraction"` |  | Same meaning as on nodes (manual editor v0) |
| `manualAuthor` | string |  | When `source === "manual"`, the author's uid |
| `manualNote` | string |  | When `source === "manual"`, an optional free-form note from the author |
| `tboxVersionId` | string |  | (P1 Phase 1) Active TBox version ID at the time this edge was created/reviewed. Legacy = undefined |
| `qualifiers` | `Array<{propertyId: string; value: QualifierValue}>` |  | **V1.1 (PR #10)** Wikidata-inspired statement qualifiers. Additive, zero breakage. Legacy = undefined. `QualifierValue` union: `{kind:'string', raw}` / `{kind:'time', iso, precision}` / `{kind:'quantity', value, unit?}` / `{kind:'nodeRef', nodeId}`. |
| `rank` | `"preferred" \| "normal" \| "deprecated"` |  | **V1.1 (PR #10)** Priority among multiple statements with the same (from, to, type). Legacy = undefined → falls back to `rank ?? 'normal'`. |

### `knowledgePublishes/{publishId}`

Execution history of public projection publishes.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Publish ID |
| `status` | `"running" \| "succeeded" \| "failed" \| "rolled-back"` | ✅ | Publish status |
| `initiatedBy` | string | ✅ | Initiator |
| `startedAt` | Timestamp | ✅ | Start time |
| `completedAt` | Timestamp |  | Completion time |
| `sourceApprovedRevision` | string | ✅ | Reference canonical revision or snapshot ID |
| `nodeCount` | number |  | Number of applied nodes |
| `edgeCount` | number |  | Number of applied edges |
| `projectionVersion` | string | ✅ | Projection schema version |
| `errorCode` | string |  | Failure code |
| `errorMessage` | string |  | Failure message |
| `rollbackOfPublishId` | string |  | ID of the publish being rolled back |

### `knowledgePublicNodes/{nodeId}`

Public projection node.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Node ID |
| `title` | string | ✅ | Public title |
| `kind` | string | ✅ | Public kind |
| `projectIds` | string[] | ✅ | Linked projects |
| `parentId` | string |  | Public hierarchy parent |
| `summary` | string |  | Public summary |
| `evidenceCount` | number | ✅ | Number of public evidence items |
| `publishId` | string | ✅ | ID of the publish that produced this node |
| `projectionVersion` | string | ✅ | Projection schema version |
| `publishedAt` | Timestamp | ✅ | Time the publish was applied |
| `lastApprovedAt` | Timestamp | ✅ | Time the approval was applied |

### `knowledgePublicEdges/{edgeId}`

Public projection edge.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Edge ID |
| `from` | string | ✅ | Source node ID |
| `to` | string | ✅ | Target node ID |
| `type` | string | ✅ | Public relation type |
| `projectIds` | string[] | ✅ | Linked projects |
| `publishId` | string | ✅ | ID of the publish that produced this edge |
| `projectionVersion` | string | ✅ | Projection schema version |
| `publishedAt` | Timestamp | ✅ | Time the publish was applied |
| `lastApprovedAt` | Timestamp | ✅ | Time the approval was applied |

### `knowledgePublicMeta/current`

Pointer document for the currently public projection.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `currentPublishId` | string | ✅ | ID of the currently public snapshot publish |
| `publishedAt` | Timestamp | ✅ | Pointer cutover time |
| `projectionVersion` | string | ✅ | Projection schema version |

### `ontologyClasses/{classId}`

Ontology TBox — node class definitions. Legal values for `knowledgeApprovedNodes.kind` plus semantic metadata. Admin write, public read (so that public surfaces can display class labels).

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Class ID. kebab-case (e.g., `project`, `domain`, `capability`, `element`, `document`) |
| `name` | string | ✅ | Display name (Korean OK) |
| `description` | string |  | What the class represents |
| `parentClassId` | string |  | Parent class ID. Expresses the class hierarchy (e.g., `element` < `capability`). None means root |
| `elementType` | string |  | Sub-classification when `id` is `element` (`service` / `api` / `agent` / `workflow` / `schema` / `data-store` / `ui` / `prompt` / `integration`). Not used for other classes |
| `version` | number | ✅ | TBox version, used to track schema changes |
| `createdAt` | Timestamp | ✅ | Created at |
| `createdBy` | string | ✅ | Creator email or `system` |
| `updatedAt` | Timestamp |  | Last updated at |

C-1 seed (T-1):

| `id` | `name` | `parentClassId` | Notes |
| --- | --- | --- | --- |
| `project` | 프로젝트 | (root) | Externally visible product/system/initiative |
| `domain` | 도메인 | (root) | A large problem area within a project |
| `capability` | 역량 | (root) | Functional ability provided by a domain |
| `element` | 요소 | (root) | Actual implementation/asset/interface/data structure (sub-classified via `elementType`) |
| `document` | 문서 | (root) | Evidence node. Not attached to the hierarchy tree; connected via `describes` |
| `unknown` | 미지 | (root) | Stub placeholder — auto-created when frontmatter `relates.target` does not exist. Promoted/dismissed from the review queue (id-resolution.md §2) |

### `ontologyRelations/{relationId}`

Ontology TBox — relation type definitions. Legal values for `knowledgeApprovedEdges.type` plus constraints. Admin write, public read.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | ✅ | Relation ID (e.g., `depends_on`) |
| `name` | string | ✅ | Display name (Korean OK) |
| `inverseName` | string |  | Reverse-direction display name (e.g., `depended-on-by`) |
| `description` | string |  | Meaning of the relation |
| `sourceClassIds` | string[] | ✅ | Class IDs allowed as the source (TBox constraint). Empty array = all classes allowed |
| `targetClassIds` | string[] | ✅ | Class IDs allowed as the target |
| `category` | `"structure" \| "behavior" \| "evidence" \| "weak"` | ✅ | Relation category. `structure` = structural relations (`contains`, `belongs_to`), `behavior` = behavioral relations (`depends_on`, `implements`, `uses`), `evidence` = evidence relation (`describes`), `weak` = weak association (`related_to`) |
| `symmetric` | boolean | ✅ | Whether A→B is equivalent to B→A (e.g., `related_to` is true, `depends_on` is false) |
| `transitive` | boolean | ✅ | Whether A→B + B→C ⇒ A→C holds (e.g., `contains` is true, `uses` is false) |
| `version` | number | ✅ | TBox version |
| `createdAt` | Timestamp | ✅ | Created at |
| `createdBy` | string | ✅ | Creator email or `system` |
| `updatedAt` | Timestamp |  | Last updated at |

C-1 seed (T-1, 7 entries):

| `id` | `name` | `category` | `sourceClassIds` | `targetClassIds` | `symmetric` | `transitive` |
| --- | --- | --- | --- | --- | --- | --- |
| `contains` | 포함 | structure | `project`, `domain`, `capability` | `domain`, `capability`, `element` | false | true |
| `belongs_to` | 소속 | structure | `domain`, `capability`, `element` | `project`, `domain`, `capability` | false | true |
| `depends_on` | 의존 | behavior | `project`, `capability`, `element` | `project`, `capability`, `element` | false | false |
| `implements` | 구현 | behavior | `element` | `capability` | false | false |
| `uses` | 사용 | behavior | `element`, `capability` | `element` | false | false |
| `describes` | 설명 | evidence | `document` | `project`, `domain`, `capability`, `element` | false | false |
| `related_to` | 연관 | weak | `[]` (all classes) | `[]` | true | false |

> Note: the `knowledgeApprovedEdges.type` enum is expanded from 5 → 7 in T-2. The T-1 seed alone cannot enforce data integrity; it becomes meaningful only when applied alongside T-2.

### `ontologyTBoxVersions/{versionId}`

(P1 Phase 1) Point-in-time TBox snapshot. Whenever `ontologyClasses` / `ontologyRelations` (active, mutable) change, an immutable copy is taken. This tracks which schema version a fact node/edge was created against, preserving the audit trail and the ability to reproduce extraction results.

read = authenticated users, create = authenticated users (createdBy must equal their own uid), update/delete blocked.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `versionId` | string | ✅ | Doc ID. `v1` / `v2` / ... or an ISO timestamp. Format is free-form — sorting is by `createdAt` |
| `classes` | object[] | ✅ | Array of class definitions at snapshot time. Each entry has the same schema as an `ontologyClasses` doc |
| `relations` | object[] | ✅ | Array of relation definitions at snapshot time. Each entry has the same schema as an `ontologyRelations` doc |
| `changeNote` | string |  | Human-readable change summary (e.g., "added concept class") |
| `createdAt` | Timestamp | ✅ | Snapshot time |
| `createdBy` | string | ✅ | Creator uid |

### `ontologyTBoxState/current`

(P1 Phase 1) Active TBox version pointer. In single-user mode this is a single doc named `current`. Activating a new version is done by `setDoc` swap — the corresponding `ontologyTBoxVersions/{versionId}` must already exist for it to be meaningful.

read = authenticated users, create/update = authenticated users (activatedBy must equal their own uid), delete blocked.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `versionId` | string | ✅ | Currently active version. Must exist in `ontologyTBoxVersions/{versionId}` |
| `activatedAt` | Timestamp | ✅ | Activation time |
| `activatedBy` | string | ✅ | uid of the activator |

> Phase 1 = data model + rules foundation only. The UI (`/settings/ontology`) lands in Phase 2. The `tboxVersionId` writer for fact nodes also lands in Phase 2 (the UI subscribes to the active versionId and stamps it on manual create).

## 5. Storage layout

```text
storage/
├── screenshots/
│   └── {projectSlug}/
│       ├── cover.webp
│       └── {timestamp}-{safeName}
└── knowledge-documents/
    └── {documentId}/
        └── {versionId}.md
```

`knowledge-documents/*` is used as an append-only path for source-text storage (see `storage.rules`).

## 6. Trusted backend contract (historical)

> **Mission v2 status (2026-05-01)**: The `functions/` folder itself was retired in mission v2 cleanup, and `firebase.json` no longer deploys Functions. The collections below were originally owned by Cloud Functions; today they are either **live as static-export-friendly direct writes** from the manual builder (manual editor → `knowledgeApprovedNodes/Edges`) or **cold storage** with no current writer. The trusted-backend boundary is preserved in Firestore Security Rules so re-introducing a backend in the future is a config flip, not a rewrite.

Originally backend-owned:

- Cold storage (no current writer): `knowledgeDocumentChunks`, `knowledgeEvidence`, `knowledgeExtractionOutputs`, `knowledgeReviewEvents`, `knowledgeApprovalEvents`
- Still live (manual builder writes through the same client SDK that backend used to use): `knowledgeApprovedNodes`, `knowledgeApprovedEdges`, `knowledgePublishes`, `knowledgePublicNodes`, `knowledgePublicEdges`

Browser clients still don't write to the cold-storage collections.

## 7. Security summary

- `projects`, `categories`, `statuses`, `meta`, `knowledgePublicMeta`, `knowledgePublicNodes`, `knowledgePublicEdges`:
  - Public read
- `admins`:
  - Read own document only; no writes
- `knowledgeDocuments`, `knowledgeDocumentVersions`, `knowledgeReviews`:
  - Admin read/write
- `knowledgeExtractionJobs`:
  - Admin read; no direct browser writes
- `knowledgeDocumentChunks`, `knowledgeEvidence`, `knowledgeExtractionOutputs`, `knowledgeReviewEvents`, `knowledgeApprovalEvents`, `knowledgeApprovedNodes`, `knowledgeApprovedEdges`, `knowledgePublishes`:
  - Admin read; no client writes
- `knowledge-documents/*` Storage:
  - Admin read/write

## 8. Retention / Backup principles

- `knowledgeDocumentVersions`, `knowledgeEvidence`, `knowledgeApprovalEvents`, `knowledgePublishes`:
  - Retained indefinitely by default
- `knowledgeDocumentChunks`, `knowledgeExtractionOutputs`, `knowledgeExtractionJobs`, `knowledgeReviewEvents`:
  - Eligible for cleanup once an archive/export policy is in place
- Publish rollback is a logical rollback; disaster recovery is handled separately via Firestore/Storage backup restores.

## 9. Change history

Records only changes from the point at which the codebase relaunched as `oh-my-ontology`. A proper changelog will be operated separately after the first release.
