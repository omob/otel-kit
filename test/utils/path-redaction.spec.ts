import { QueryRedaction } from "../../src/enums/query-redaction.enum";
import { isIdentifier, maskPath, maskQuery, maskUrl } from "../../src/utils/path-redaction";

// route segments that must survive: every digit-bearing one from a 443-segment production corpus, and the long names
// a naive length rule would mask
const ROUTE_SEGMENTS = [
  "v1",
  "v2",
  "v2.0",
  "oauth2",
  "login-2fa",
  "activate-2fa",
  "agency-v2",
  "coinsurance-v2",
  "confirm-otp-v2",
  "individual-v2",
  "process-multi-payment-wallet-credit-retry",
  "change-in-relationship-manager",
  "password-expiry-notification",
  "transfers",
  "health",
];

const IDENTIFIERS = [
  ["an 11-digit BVN", "22123456789"],
  ["a 10-digit NUBAN", "0123456789"],
  ["a driver's licence", "FKJ49606AA01"],
  ["a passport number", "A50123456"],
  ["a VIN", "1HGCM82633A004352"],
  ["a UUID", "3f2b8c1e-9a4d-4c7e-8f1a-2b3c4d5e6f70"],
  ["a UUID with no digits", "abcdefab-cdef-abcd-efab-cdefabcdefab"],
  ["a 64-character hex token", "a".repeat(32) + "b".repeat(32)],
  ["an email", "customer@example.com"],
  ["a prefixed reference", "WD_9f8e7d6c5b4a3210"],
];

describe("path redaction", () => {
  it.each(ROUTE_SEGMENTS)("keeps the route segment %p", (segment) => {
    expect(isIdentifier(segment)).toBe(false);
  });

  it.each(IDENTIFIERS)("masks %s", (_, segment) => {
    expect(isIdentifier(segment)).toBe(true);
  });

  it("masks each identifying segment of a path and keeps its shape", () => {
    expect(maskPath("/v1/customers/22123456789/documents/FKJ49606AA01")).toBe("/v1/customers/*/documents/*");
  });

  it("masks a query string left on the path, as @fastify/otel leaves it", () => {
    expect(maskPath("/sessions?token=abcdefab-cdef-abcd-efab-cdefabcdefab&page=2")).toBe("/sessions?token=*&page=2");
  });

  it("recognises a percent-encoded email", () => {
    expect(maskPath("/users/customer%40example.com/profile")).toBe("/users/*/profile");
  });

  it("masks the path and identifying query values of a full url, and leaves its host, port and other values alone", () => {
    expect(maskUrl("https://api.example:8443/v2/accounts/0123456789?page=2&token=a1b2c3d4e5")).toBe(
      "https://api.example:8443/v2/accounts/*?page=2&token=*"
    );
  });

  it.each([
    ["email=customer%40example.com&sort=name", "email=*&sort=name"],
    ["?account=0123456789", "?account=*"],
    ["page=2&size=50", "page=2&size=50"],
    ["tag=a&tag=12345678&q=hello%20world&flag", "tag=a&tag=*&q=hello%20world&flag"],
    ["q=a+b&email=ada%40example.com", "q=a+b&email=*"],
  ])("masks identifying values in the query %p", (query, masked) => {
    expect(maskQuery(query)).toBe(masked);
  });

  it("drops the query, and only the query, when path masking is off", () => {
    const redaction = { maskSegments: false, query: QueryRedaction.DROP };

    expect(maskUrl("https://api.example/customers/0123456789?insuredName=Ada#top", redaction)).toBe(
      "https://api.example/customers/0123456789"
    );
    expect(maskPath("/customers/0123456789?insuredName=Ada", redaction)).toBe("/customers/0123456789");
  });

  it("leaves a value that is not a url untouched", () => {
    expect(maskUrl("not a url")).toBe("not a url");
  });
});
