export enum ArchitectureAttribute {
  COMPONENT_NAME = "ritele.component.name",
  COMPONENT_TYPE = "ritele.component.type",
  LAYER = "ritele.layer",
  DOMAIN = "ritele.domain",
  OWNER = "ritele.owner",
  INTENDED_DEPENDENCIES = "ritele.intended_dependencies",
  CONCURRENCY_PREFIX = "ritele.concurrency.",
  CPU_LIMIT = "ritele.cpu.limit",
  // semantic conventions still list peer.service as incubating, whose subpath export only resolves under node16
  PEER_SERVICE = "peer.service",
}
