import { SpanKind } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/sdk-trace-node";
import PeerResolutionProcessor from "../../src/processors/peer-resolution.processor";

const span = (kind: SpanKind, attributes: Record<string, unknown>) => {
  const attrs: Record<string, unknown> = { ...attributes };
  return { kind, attributes: attrs, setAttribute: (k: string, v: unknown) => void (attrs[k] = v) } as unknown as Span;
};

describe("PeerResolutionProcessor", () => {
  const processor = new PeerResolutionProcessor({ "api.paystack.co": "paystack", "*.interswitch.com": "interswitch" });

  it("maps an exact host on a client span to peer.service", () => {
    const s = span(SpanKind.CLIENT, { "server.address": "api.paystack.co" });
    processor.onStart(s);
    expect(s.attributes["peer.service"]).toBe("paystack");
  });

  it("matches wildcard suffixes case-insensitively and strips ports", () => {
    const s = span(SpanKind.CLIENT, { "server.address": "Sandbox.Interswitch.com:443" });
    processor.onStart(s);
    expect(s.attributes["peer.service"]).toBe("interswitch");
  });

  it("falls back to legacy host attributes", () => {
    const s = span(SpanKind.CLIENT, { "net.peer.name": "api.paystack.co" });
    processor.onStart(s);
    expect(s.attributes["peer.service"]).toBe("paystack");
  });

  it("leaves server spans, unknown hosts and an existing peer.service alone", () => {
    const server = span(SpanKind.SERVER, { "server.address": "api.paystack.co" });
    const unknown = span(SpanKind.CLIENT, { "server.address": "example.org" });
    const named = span(SpanKind.CLIENT, { "server.address": "api.paystack.co", "peer.service": "custom" });
    [server, unknown, named].forEach((s) => processor.onStart(s));
    expect(server.attributes["peer.service"]).toBeUndefined();
    expect(unknown.attributes["peer.service"]).toBeUndefined();
    expect(named.attributes["peer.service"]).toBe("custom");
  });

  it("keeps an ipv6 literal intact while still stripping a port", () => {
    const v6 = new PeerResolutionProcessor({ "2001:db8::1": "v6-cache" });
    const plain = span(SpanKind.CLIENT, { "server.address": "2001:db8::1" });
    const bracketed = span(SpanKind.CLIENT, { "server.address": "[2001:db8::1]:6379" });

    v6.onStart(plain);
    v6.onStart(bracketed);

    expect(plain.attributes["peer.service"]).toBe("v6-cache");
    expect(bracketed.attributes["peer.service"]).toBe("v6-cache");
  });

  it("prefers the longest matching suffix over config order", () => {
    const nested = new PeerResolutionProcessor({ "*.example.com": "broad", "*.eu.example.com": "regional" });
    const s = span(SpanKind.CLIENT, { "server.address": "api.eu.example.com" });

    nested.onStart(s);

    expect(s.attributes["peer.service"]).toBe("regional");
  });

  it("ignores a pattern that is neither an exact host nor a *.suffix", () => {
    const bad = new PeerResolutionProcessor({ "api.*.com": "nope" });
    const s = span(SpanKind.CLIENT, { "server.address": "api.paystack.com" });

    bad.onStart(s);

    expect(s.attributes["peer.service"]).toBeUndefined();
  });
});
