export enum ArchitectureAttribute {
  COMPONENT_NAME = "archscope.component.name",
  COMPONENT_TYPE = "archscope.component.type",
  LAYER = "archscope.layer",
  DOMAIN = "archscope.domain",
  OWNER = "archscope.owner",
  INTENDED_DEPENDENCIES = "archscope.intended_dependencies",
  CONCURRENCY_PREFIX = "archscope.concurrency.",
  // semantic conventions still list peer.service as incubating, whose subpath export only resolves under node16
  PEER_SERVICE = "peer.service",
}
