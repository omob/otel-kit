import { diag, SpanKind } from "@opentelemetry/api";
import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVER_ADDRESS } from "@opentelemetry/semantic-conventions";
import { ArchitectureAttribute } from "../enums/architecture-attribute.enum";

// pre-stable http/net conventions still emitted by some instrumentations
const LEGACY_HOST_ATTRS = ["net.peer.name", "http.host"];

// a graph keys external nodes on peer.service when it is there, so three regional hostnames collapse to one node
class PeerResolutionProcessor implements SpanProcessor {
  private readonly exact = new Map<string, string>();
  private readonly suffixes: Array<[string, string]> = [];

  constructor(peers: Record<string, string>) {
    for (const [host, name] of Object.entries(peers)) {
      if (host.startsWith("*.")) {
        this.suffixes.push([host.slice(1).toLowerCase(), name]);
      } else if (host.includes("*")) {
        diag.warn(`@omob/otel-kit ignores the peer pattern "${host}"; only an exact host or a *.suffix matches`);
      } else {
        this.exact.set(host.toLowerCase(), name);
      }
    }

    // a longer suffix is the more specific match, and object key order should not decide which name a host gets
    this.suffixes.sort(([a], [b]) => b.length - a.length);
  }

  onStart(span: Span): void {
    if (span.kind !== SpanKind.CLIENT && span.kind !== SpanKind.PRODUCER) {
      return;
    }

    if (span.attributes[ArchitectureAttribute.PEER_SERVICE] !== undefined) {
      return;
    }

    const host = this.hostOf(span);
    const name = host && this.resolve(host);

    if (name) {
      span.setAttribute(ArchitectureAttribute.PEER_SERVICE, name);
    }
  }

  onEnd(): void {
    return undefined;
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private resolve(host: string): string | undefined {
    const lower = host.toLowerCase();

    return this.exact.get(lower) ?? this.suffixes.find(([suffix]) => lower.endsWith(suffix))?.[1];
  }

  // an ipv6 literal is all colons, so only a lone trailing :port is one
  private static withoutPort(host: string): string {
    const closing = host.indexOf("]");

    if (host.startsWith("[")) {
      return closing === -1 ? host : host.slice(1, closing);
    }

    const parts = host.split(":");

    return parts.length === 2 ? parts[0] : host;
  }

  private hostOf(span: Span): string | undefined {
    for (const key of [ATTR_SERVER_ADDRESS, ...LEGACY_HOST_ATTRS]) {
      const value = span.attributes[key];

      if (typeof value === "string" && value) {
        return PeerResolutionProcessor.withoutPort(value);
      }
    }

    return undefined;
  }
}

export default PeerResolutionProcessor;
