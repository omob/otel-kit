import { SpanKind } from "@opentelemetry/api";
import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVER_ADDRESS } from "@opentelemetry/semantic-conventions";

const ATTR_PEER_SERVICE = "peer.service";
// pre-stable http/net conventions still emitted by some instrumentations
const LEGACY_HOST_ATTRS = ["net.peer.name", "http.host"];

/**
 * Gives outbound calls a stable peer name. A dependency graph keys external nodes on `peer.service` when
 * present and falls back to the raw host, so mapping "api.paystack.co" to "paystack" turns three regional
 * hostnames into one component. Runs on span start, which is when http and undici set the host.
 */
class PeerResolutionProcessor implements SpanProcessor {
  private readonly exact = new Map<string, string>();
  private readonly suffixes: Array<[string, string]> = [];

  constructor(peers: Record<string, string>) {
    for (const [host, name] of Object.entries(peers)) {
      if (host.startsWith("*.")) {
        this.suffixes.push([host.slice(1).toLowerCase(), name]);
      } else {
        this.exact.set(host.toLowerCase(), name);
      }
    }
  }

  onStart(span: Span): void {
    if (span.kind !== SpanKind.CLIENT && span.kind !== SpanKind.PRODUCER) {
      return;
    }

    if (span.attributes[ATTR_PEER_SERVICE] !== undefined) {
      return;
    }

    const host = this.hostOf(span);
    const name = host && this.resolve(host);

    if (name) {
      span.setAttribute(ATTR_PEER_SERVICE, name);
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

  resolve(host: string): string | undefined {
    const lower = host.toLowerCase();

    return this.exact.get(lower) ?? this.suffixes.find(([suffix]) => lower.endsWith(suffix))?.[1];
  }

  private hostOf(span: Span): string | undefined {
    for (const key of [ATTR_SERVER_ADDRESS, ...LEGACY_HOST_ATTRS]) {
      const value = span.attributes[key];

      if (typeof value === "string" && value) {
        return value.split(":")[0];
      }
    }

    return undefined;
  }
}

export default PeerResolutionProcessor;
