import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildTrustSnapshot } from '../src/trust-list/index';

const XML = `<?xml version="1.0"?>
<TrustServiceStatusList>
  <SchemeInformation><TSLSequenceNumber>42</TSLSequenceNumber></SchemeInformation>
  <TrustServiceProvider>
    <Name xml:lang="uk">КНЕДП ДПС</Name>
    <ServiceInformation>Subject: CN=QTSP State Tax Service of Ukraine, O=DPS</ServiceInformation>
  </TrustServiceProvider>
</TrustServiceStatusList>`;

const xmlSha = createHash('sha256').update(Buffer.from(XML, 'utf8')).digest('hex');

describe('buildTrustSnapshot', () => {
  it('verifies the published hash when it matches', () => {
    const snapshot = buildTrustSnapshot({
      profile: 'TL-UA-DSTU',
      xml: XML,
      publishedHashFile: `${xmlSha}  TL-UA-DSTU.xml`,
    });

    expect(snapshot.sha256).toBe(xmlSha);
    expect(snapshot.hashVerified).toBe(true);
    expect(snapshot.sequenceNumber).toBe('42');
    expect(snapshot.profile).toBe('TL-UA-DSTU');
  });

  it('marks the hash unverified when it does not match', () => {
    const snapshot = buildTrustSnapshot({
      profile: 'TL-UA-DSTU',
      xml: XML,
      publishedHashFile: 'deadbeef',
    });

    expect(snapshot.hashVerified).toBe(false);
  });

  it('extracts issuer / TSP names lower-cased', () => {
    const snapshot = buildTrustSnapshot({ profile: 'TL-UA-DSTU', xml: XML, publishedHashFile: null });

    expect(snapshot.issuerCns).toContain('кнедп дпс');
    expect(snapshot.issuerCns).toContain('qtsp state tax service of ukraine');
  });
});
