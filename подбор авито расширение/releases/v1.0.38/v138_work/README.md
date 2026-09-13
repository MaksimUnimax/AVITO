# Avito Finder v1.0.38

Minimal patch over exact v1.0.37. Avito recovery endpoint creation requests Proxy.Market sticky rotation (-1) instead of every-request rotation (0), and reconciliation accepts only the sticky endpoint. Queue/navigation/capture/proxy manager are unchanged. API key remains session-scoped. CAPTCHA remains manual.
