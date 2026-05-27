const forwardedForHeader = "x-forwarded-for";
const realIpHeader = "x-real-ip";
const cfConnectingIpHeader = "cf-connecting-ip";
const vercelForwardedForHeader = "x-vercel-forwarded-for";
const userAgentHeader = "user-agent";

type HeaderReader = Pick<Headers, "get">;

export function normalizeClientIp(value: string) {
  let clientIp = value.split(",")[0]?.trim() ?? "";

  if (clientIp.startsWith("[") && clientIp.includes("]")) {
    clientIp = clientIp.slice(1, clientIp.indexOf("]"));
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(clientIp)) {
    clientIp = clientIp.slice(0, clientIp.lastIndexOf(":"));
  }

  if (clientIp.startsWith("::ffff:")) {
    clientIp = clientIp.slice("::ffff:".length);
  }

  return clientIp.slice(0, 120);
}

export function getClientIpFromHeaders(headers: HeaderReader) {
  const forwardedFor = headers.get(forwardedForHeader);
  const realIp = headers.get(realIpHeader);
  const cloudflareIp = headers.get(cfConnectingIpHeader);
  const vercelForwardedFor = headers.get(vercelForwardedForHeader);
  const rawIp =
    forwardedFor || realIp || cloudflareIp || vercelForwardedFor || "";

  return rawIp ? normalizeClientIp(rawIp) : "";
}

export function getClientIp(request: Request) {
  return getClientIpFromHeaders(request.headers);
}

export function getUserAgentFromHeaders(headers: HeaderReader) {
  return (headers.get(userAgentHeader) ?? "").trim().slice(0, 300);
}

export function getUserAgent(request: Request) {
  return getUserAgentFromHeaders(request.headers);
}
