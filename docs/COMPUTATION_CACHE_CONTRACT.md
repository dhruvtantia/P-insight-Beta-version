# Private Computation Cache Contract

Updated: 2026-10-20. B04 evidence: [issue #7](https://github.com/dhruvtantia/P-insight-Beta-version/issues/7). [Checkpoint](EXECUTION_STATUS.md) | [Launch gates](PRODUCTION_READINESS.md).

## Identity Before Reuse

The optimizer and quantitative analytics services resolve current holdings before checking a saved answer. Real uploaded/live providers attach a `PortfolioComputationScope` to the same selected portfolio read. Providers are request-scoped; do not share their SQLAlchemy sessions across requests.

A private key hashes strict canonical JSON with full SHA-256. It includes the cache-contract version, service namespace, provider class/mode, authenticated owner (or explicit local legacy scope), portfolio ID, revision token, process generation, complete ordered holding DTOs and the actual computation inputs. Preserving all holding fields also captures prices, provenance, currency and display metadata; repeated rows are not silently deduplicated for key generation.

| Cache | Additional identity inputs |
|---|---|
| Optimizer result | Requested period, expected-return/covariance methods, frontier resolution, every dataclass constraint, risk-free rate, normalized fetched histories and per-ticker source outcomes |
| Quant result | Requested period, sliced history data/source/failure outcomes, benchmark response, risk-free rate, trading-day policy and methodology version |
| Quant raw history | Same owner/portfolio/revision/generation/holdings scope and explicit full-year fetch window; shorter allowed periods reuse that snapshot through slicing |

The provider's optional `computation_cache_scope` property defaults to `None`, which disables shared private caching. Unknown/invalid scope, missing owner while authentication is enabled, or unsupported/nonfinite key inputs bypass caching rather than guessing identity. Such a bypass is not permission to read unowned data: authentication and owner-filtered database reads remain separate requirements.

## Interim Revision Boundary

**B04 does not create a durable database revision.** The current token contains the selected portfolio's persisted `updated_at` and `last_synced_at` values. Complete holding DTOs and actual historical inputs additionally identify the calculation. Read providers refresh already-loaded ORM state so a reused read session does not silently keep old holding values.

B09 must replace the timestamp surrogate with the accepted persisted revision identity, verify PostgreSQL/concurrent mutation semantics and repeat the isolation tests. B12-B14 must integrate accepted import/job revisions and supersession. These remain launch gates; this cache change is not a transactional snapshot or durable-worker certificate.

## Mutation and In-Flight Policy

Successful portfolio create/upload, activate, rename, delete, refresh, enrichment patch and price-outcome persistence advance a thread-safe process generation after database commit. New requests use a different generation. A calculation started before invalidation cannot populate the new generation's cache; its old caller can still receive its captured input snapshot. Revision-tagged response/UI fencing remains B09/B14/B18 work.

Explicit optimizer/quant clear functions also advance the generation. Background quant pre-warming supplies the persisted portfolio owner and ID, matching foreground identity. Old-generation entries are unreachable; bounded eviction, explicit clearing or process restart reclaim them. Invalidation is deliberately coarse across private caches in this process, not a distributed invalidation protocol.

Other workers observe changed database timestamps/holding snapshots on their reads. Durable cross-process revision publication and upstream corrected-data invalidation must be verified in the later database/job/provider batches. Do not move private results into Redis or another shared store before those contracts are established.

## Freshness and Failure Policy

- Optimizer lookup follows current holdings/history retrieval, so the actual fetched history participates in the result key. This caches numerical solves, not permission to skip input reads. Measure provider traffic/latency before production; reduced fetch volume is not claimed by this change.
- Quant checks its scoped raw-history snapshot before looking up the result. Expired raw history is fetched again, and the resulting data participates in the result key. A result hit cannot conceal a new failed fetch after raw-history expiry.
- Successful complete raw history can be reused for up to 600 seconds in uploaded/live modes. Result TTL is also 600 seconds. Existing mock-only TTL remains 24 hours; mock API mode is not re-enabled. Provider/benchmark caches have their own freshness policies, which B13/B15 must verify; cache TTL is not a real-time-data claim.
- Optimizer errors/partial history, quant errors/incomplete holdings/unsupported weights/unavailable benchmark and unavailable history outcomes are not stored as private answers. Degraded responses can still be returned honestly; later requests retry. Successful quant raw history may remain reusable while benchmark retrieval is retried.
- Holdings and constraints are copied before asynchronous work; stored and returned nested private values do not share mutable objects. A caller cannot alter later results by editing a returned response.

## Storage and Modularity

The existing `TimedMemoryCache` remains process-local. Each cache has a default capacity of 256 entries, oldest-written eviction, monotonic-clock expiry and synchronized get/set/clear operations. Capacity bounds entry count, not payload bytes. Large portfolios, simultaneous misses, memory budgets and traffic/provider quotas still need B23 load acceptance; no single-flight or background expiry sweep is claimed.

`computation_cache.py` owns identity/key policy and generation fencing. Providers own owner-filtered portfolio selection; optimizer/quant modules own input preparation and numerical methods; the existing cache service owns storage. Public DTOs, routes and financial formulas are not redesigned. Shared public market-data caches and browser query state are outside B04's private result-cache change.

## Evidence and Remaining Gates

Synthetic tests cover owners, identical/different portfolios, revision tokens, every optimizer option/constraint, holding/provenance changes, actual history/benchmark changes, recovery, raw/result expiry interaction, nested-copy isolation, in-flight mutation, threaded storage/generation operations, missing identity, real provider selection/refresh and authenticated uploaded/live status routes.

The issue owns exact-head CI, final review, merge/post-merge CI and safe local reconciliation. Passing these tests does not approve production, establish numerical methodology correctness, license data, or complete the full private-operation matrix. Full-roadmap first-launch scope remains unchanged.
