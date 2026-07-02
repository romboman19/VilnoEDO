import { Hono } from 'hono';

export const bootstrapRoute = new Hono().get('/', (c) => {
  return c.json({
    ok: true,
    methods: [
      { id: 'privatbank-jks', label: 'PrivatBank JKS', enabled: true },
      { id: 'iit-token', label: 'IIT token', enabled: false },
      { id: 'smartid', label: 'SmartID', enabled: false },
    ],
    assets: {
      workerUrl: '/ua-kep/vendor/euscp.worker.js',
      caRegistryUrl: '/ua-kep/data/CAs.json',
      caBundleUrl: '/ua-kep/data/CACertificates.p7b',
    },
  });
});
