import type { Context } from 'hono';

import { getProxyAllowedHosts, normalizeProxyTarget } from './ca-registry';

export const handleUaKepPkiProxy = async (c: Context) => {
  try {
    const upstreamUrl = normalizeProxyTarget(c.req.query('address'));
    const allowedHosts = await getProxyAllowedHosts();

    if (!allowedHosts.has(upstreamUrl.hostname.toLowerCase())) {
      return c.text('PKI proxy host is not allowed.', 403);
    }

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

    const upstreamResponse = await fetch(upstreamUrl, {
      method: c.req.method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'follow',
    });

    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());

    if (!upstreamResponse.ok) {
      return c.text(`PKI upstream error: ${upstreamResponse.status}`, 502);
    }

    c.header('Cache-Control', 'no-store');
    return c.text(responseBuffer.toString('base64'));
  } catch (error) {
    return c.text('PKI proxy request failed.', 502);
  }
};
