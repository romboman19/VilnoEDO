import { Hono } from 'hono';

const cloudProviders = [
  { id: 'privatbank-smartid', label: 'PrivatBank SmartID', kspId: 'pb-smartid', mobileAppName: 'Privat24' },
  { id: 'diia-signature', label: 'Diia.Signature', kspId: 'diia-sign', mobileAppName: 'Diia' },
  { id: 'depositsign', label: 'DepositSign', kspId: 'depositsign', mobileAppName: null },
  { id: 'vchasno', label: 'Vchasno cloud signature', kspId: 'vchasno', mobileAppName: null },
  { id: 'vchasnoQR', label: 'Vchasno cloud signature (QR)', kspId: 'vchasnoQR', mobileAppName: 'Vchasno.QES' },
  { id: 'cloudkey', label: 'CSK Ukraine CloudKey', kspId: 'cloudkey', mobileAppName: 'CloudKey' },
  { id: 'esign', label: 'ESign cloud signature', kspId: 'esign', mobileAppName: null },
  { id: 'smartsigntax', label: 'State Tax Service cloud signature', kspId: 'smartsigntax', mobileAppName: null },
  { id: 'pumb', label: 'PUMB cloud signature', kspId: 'pumb', mobileAppName: null },
  { id: 'ugb', label: 'Ukrgasbank EcoSign', kspId: 'ugb', mobileAppName: null },
  { id: 'alliance', label: 'Bank Alliance cloud signature', kspId: 'alliance', mobileAppName: null },
];

export const bootstrapRoute = new Hono().get('/', (c) => {
  return c.json({
    ok: true,
    methods: [
      { id: 'file-key', label: 'File QES key', status: 'ready', enabled: true },
      { id: 'iit-token', label: 'IIT hardware token', status: 'ready', enabled: true },
      ...cloudProviders.map((provider) => ({
        id: provider.id,
        label: provider.label,
        status: 'ready',
        enabled: true,
      })),
    ],
    formats: ['CADES_DETACHED'],
    providers: {
      cloud: cloudProviders,
      smartId: cloudProviders,
    },
    assets: {
      workerUrl: '/ua-kep/vendor/euscp.worker.js',
      caRegistryUrl: '/ua-kep/data/CAs.json',
      caBundleUrl: '/ua-kep/data/CACertificates.p7b',
    },
  });
});
