# Backend Modules Skeleton

This package is the target home for the modular-monolith rebuild.

Each feature module should own its API boundary, business rules, schemas, errors,
and persistence access:

```text
backend/app/modules/{module}/
  router.py
  service.py
  repository.py
  schemas.py
  errors.py
```

Rules:

- `router.py` contains FastAPI endpoint functions only.
- `service.py` contains business logic and orchestration.
- `repository.py` contains database reads/writes.
- `schemas.py` contains strict Pydantic request/response models.
- `errors.py` contains module-specific `AppError` subclasses.
- No frontend client calls external market, broker, or AI providers directly.
- No module reaches into another module's tables without going through an explicit service/repository contract.

The existing application still runs from the legacy route/service layout. Move
one module at a time into this package during Phases 1-8.

