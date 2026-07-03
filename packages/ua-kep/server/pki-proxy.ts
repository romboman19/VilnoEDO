import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { Context } from 'hono';

import { getProxyAllowedHosts, normalizeProxyTarget } from './ca-registry';

const PKI_PROXY_TIMEOUT_MS = 10_000;
const PKI_PROXY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const ipv4ToNumber = (ip: string) =>
  ip.split('.').reduce((value, octet) => (value << 8) + Number.parseInt(octet, 10), 0) >>> 0;

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  ['0.0.0.0', '0.255.255.255'],
  ['10.0.0.0', '10.255.255.255'],
  ['100.64.0.0', '100.127.255.255'],
  ['127.0.0.0', '127.255.255.255'],
  ['169.254.0.0', '169.254.255.255'],
  ['172.16.0.0', '172.31.255.255'],
  ['192.0.0.0', '192.0.0.255'],
  ['192.0.2.0', '192.0.2.255'],
  ['192.168.0.0', '192.168.255.255'],
  ['198.18.0.0', '198.19.255.255'],
  ['198.51.100.0', '198.51.100.255'],
  ['203.0.113.0', '203.0.113.255'],
  ['224.0.0.0', '255.255.255.255'],
].map(([start, end]) => [ipv4ToNumber(start), ipv4ToNumber(end)]);

const isPrivateIpv4 = (address: string) => {
  const value = ipv4ToNumber(address);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff')
  );
};

const isPrivateIpAddress = (address: string) => {
  const family = isIP(address);

  if (family === 4) {
    return isPrivateIpv4(address);
  }

  if (family === 6) {
    const ipv4MappedAddress = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];

    if (ipv4MappedAddress) {
      return isPrivateIpv4(ipv4MappedAddress);
    }

    return isPrivateIpv6(address);
  }

  return true;
};

const assertPublicProxyTarget = async (url: URL) => {
  const hostname = url.hostname.toLowerCase();
  const literalAddressFamily = isIP(hostname);
  const addresses = literalAddressFamily ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error('PKI proxy target did not resolve.');
  }

  for (const { address } of addresses) {
    if (isPrivateIpAddress(address)) {
      throw new Error('PKI proxy target resolves to a private or reserved address.');
    }
  }
};

const readLimitedResponse = async (response: Response) => {
  const contentLength = response.headers.get('content-length');

  if (contentLength && Number.parseInt(contentLength, 10) > PKI_PROXY_MAX_RESPONSE_BYTES) {
    throw new Error('PKI upstream response is too large.');
  }

  const responseBuffer = Buffer.from(await response.arrayBuffer());

  if (responseBuffer.byteLength > PKI_PROXY_MAX_RESPONSE_BYTES) {
    throw new Error('PKI upstream response exceeded the size limit.');
  }

  return responseBuffer;
};

export const handleUaKepPkiProxy = async (c: Context) => {
  try {
    const upstreamUrl = normalizeProxyTarget(c.req.query('address'));
    const allowedHosts = await getProxyAllowedHosts();

    if (!allowedHosts.has(upstreamUrl.hostname.toLowerCase())) {
      return c.text('PKI proxy host is not allowed.', 403);
    }

    await assertPublicProxyTarget(upstreamUrl);

    const requestContentType = c.req.query('contentType')?.trim() || 'application/octet-stream';

    const requestHeaders: Record<string, string> = {
      Accept: '*/*',
      'User-Agent': 'VilnoEDO-UA-KEP-Proxy',
    };

    let requestBody: Buffer | undefined;

    if (!['GET', 'HEAD'].includes(c.req.method)) {
      const incomingBody = (await c.req.text()).trim();
      requestBody = incomingBody ? Buffer.from(incomingBody, 'base64') : Buffer.alloc(0);
      requestHeaders['Content-Type'] = requestContentType;
      requestHeaders['Content-Length'] = String(requestBody.length);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), PKI_PROXY_TIMEOUT_MS);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: c.req.method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'manual',
      signal: abortController.signal,
    }).finally(() => clearTimeout(timeout));

    if (REDIRECT_STATUSES.has(upstreamResponse.status)) {
      return c.text('PKI upstream redirects are not allowed.', 502);
    }

    if (!upstreamResponse.ok) {
      return c.text(`PKI upstream error: ${upstreamResponse.status}`, 502);
    }

    const responseBuffer = await readLimitedResponse(upstreamResponse);

    c.header('Cache-Control', 'no-store');
    return c.text(responseBuffer.toString('base64'));
  } catch (error) {
    return c.text('PKI proxy request failed.', 502);
  }
};
