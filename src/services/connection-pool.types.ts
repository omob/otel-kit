import type { Attributes, Histogram } from "@opentelemetry/api";
import { IConnectionPoolSnapshot } from "../telemetry.types";

export interface IConnectionPoolMember {
  read: () => IConnectionPoolSnapshot;
}

export interface IConnectionPoolGroup {
  members: Set<IConnectionPoolMember>;
  system?: string;
  attributes: Attributes;
  waitTime: Histogram;
  stop: () => void;
}
