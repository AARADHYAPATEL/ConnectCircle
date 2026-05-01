export function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProto ?? requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export function getRequestHost(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;

  return host.split(":")[0] ?? host;
}

export function getRequestUrl(request: Request, pathname: string) {
  return new URL(pathname, getRequestOrigin(request));
}

export function isPrivateNetworkHost(host: string) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}
