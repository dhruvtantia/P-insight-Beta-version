# Frontend Services Skeleton

All HTTP calls should go through module-specific service files.

Target files:

```text
apiClient.ts
portfolioApi.ts
holdingsApi.ts
uploadApi.ts
analyticsApi.ts
aiApi.ts
marketDataApi.ts
billingApi.ts
```

The current app still has a broad `api.ts`; split it gradually as backend
contracts stabilize.

