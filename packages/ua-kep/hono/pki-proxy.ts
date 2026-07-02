import { Hono } from 'hono';

import { handleUaKepPkiProxy } from '../server/pki-proxy';

export const pkiProxyRoute = new Hono().all('/ProxyHandler', handleUaKepPkiProxy);
