import { QueryRedaction } from "../enums/query-redaction.enum";

export interface IUrlRedaction {
  maskSegments: boolean;
  query: QueryRedaction;
}
