# Changelog

## 0.1.0

In development. Not yet released.

- Non-finite span attributes are dropped before export. A single `NaN` — which some instrumentations produce from an absent port or header — makes Jaeger fail to marshal the entire trace rather than the one attribute.
