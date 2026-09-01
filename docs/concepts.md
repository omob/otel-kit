# Concepts, briefly

If you're new to OpenTelemetry, this is everything you need to read the rest of this page.

A **trace** is the story of one request, start to finish. A **span** is one timed step inside that story. Spans nest, so a trace is a tree:

```
GET /login              240ms   ← the trace starts here
├─ user.lookup          180ms
│  └─ mongodb.find      175ms   ← this one you get for free
└─ token.generate        12ms
```

Each span carries a name, a start and end time, a status (did it fail), and **attributes** — key/value labels like `user.id` or `http.method`. Every span in that tree shares one **trace ID**, which is how the tree gets reassembled at the other end.

You get most spans for free. **Instrumentation** is code that wraps common libraries — HTTP, Mongo, Postgres, Redis — and opens a span whenever they're used. You never call it. `withSpan` is for the steps only you know are worth timing, like the two named above.

**Sampling** is deciding what to keep. Tracing every request at scale is expensive, so `sampleRatio: 0.1` keeps a tenth. The choice is made once at the root and the whole tree follows it, so you never get half a trace.

**Propagation** is how a trace survives a network hop. Your service puts the trace ID in an outgoing header; the next service reads it and continues the same trace instead of starting a new one. Both sides must agree on the header format — that's what `propagators` configures.

An **exporter** is where the finished data is sent: your collector, Jaeger, Google Cloud, or the console. A **resource** is the facts about the service itself — name, version, environment — stamped on everything you send.

Traces answer "what happened in this one request". **Metrics** are numbers over time ("requests per second"), and **logs** are the text lines you already write. This package can send all three; most people start with traces alone.
