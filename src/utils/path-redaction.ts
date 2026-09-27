const MASK = "*";
const NUMERIC_SEGMENT = /^\d{4,}$/;
const UUID_SEGMENT = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MIXED_SEGMENT_LENGTH = 6;
const MIXED_SEGMENT_DIGITS = 2;
const TOKEN_SEGMENT_LENGTH = 24;

export function isIdentifier(segment: string): boolean {
  if (segment.includes("@") || NUMERIC_SEGMENT.test(segment) || UUID_SEGMENT.test(segment)) {
    return true;
  }

  // a long run with no word separator is a token; a long hyphenated name is a route
  if (segment.length >= TOKEN_SEGMENT_LENGTH && !segment.includes("-")) {
    return true;
  }

  const digits = segment.replace(/\D/g, "").length;

  return segment.length >= MIXED_SEGMENT_LENGTH && digits >= MIXED_SEGMENT_DIGITS;
}

// @fastify/otel puts the raw request target in url.path, query string included
export function maskPath(path: string): string {
  const queryStart = path.indexOf("?");
  const pathPart = queryStart === -1 ? path : path.slice(0, queryStart);
  const masked = pathPart
    .split("/")
    .map((segment) => (isIdentifier(decodeSegment(segment)) ? MASK : segment))
    .join("/");

  return queryStart === -1 ? masked : `${masked}${maskQuery(path.slice(queryStart))}`;
}

// moving an id from the path to the query string must not be a way around the path rules
export function maskQuery(query: string): string {
  const prefix = query.startsWith("?") ? "?" : "";

  const parameters = query
    .slice(prefix.length)
    .split("&")
    .map((parameter) => {
      const separator = parameter.indexOf("=");

      if (separator === -1) {
        return parameter;
      }

      const value = decodeSegment(parameter.slice(separator + 1).replace(/\+/g, " "));

      return isIdentifier(value) ? `${parameter.slice(0, separator + 1)}${MASK}` : parameter;
    });

  return `${prefix}${parameters.join("&")}`;
}

export function maskUrl(value: string): string {
  try {
    const url = new URL(value);

    url.pathname = maskPath(url.pathname);
    url.search = url.search ? maskQuery(url.search) : "";

    return url.toString();
  } catch {
    return value;
  }
}

// an email arrives as %40, and the rules must see the character a person typed
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
