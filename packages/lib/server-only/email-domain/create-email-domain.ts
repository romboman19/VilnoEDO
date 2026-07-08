import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';

import { DOCUMENSO_ENCRYPTION_KEY } from '../../constants/crypto';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { symmetricEncrypt } from '../../universal/crypto';
import { generateDatabaseId } from '../../universal/id';
import { generateEmailDomainRecords } from '../../utils/email-domains';
import { registerDomainIdentityWithDkim } from './ses-client';

type CreateEmailDomainOptions = {
  domain: string;
  organisationId: string;
};

/**
 * Strip the PEM header/footer lines and join the base64 body so the DKIM public
 * key can be stored in a single-line DNS TXT record.
 */
const stripPemArmor = (pem: string) => pem.trim().split('\n').slice(1, -1).join('');

/**
 * Provision a custom sending domain: generate a fresh 2048-bit RSA DKIM key,
 * register the identity with SES (BYODKIM), and persist the domain with its
 * encrypted private key plus the DNS records the operator must publish.
 */
export const createEmailDomain = async ({ domain, organisationId }: CreateEmailDomainOptions) => {
  const encryptionKey = DOCUMENSO_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('Missing DOCUMENSO_ENCRYPTION_KEY');
  }

  const selector = `documenso-${organisationId}`.replace(/[_.]/g, '-');
  const recordName = `${selector}._domainkey.${domain}`;

  const existingDomain = await prisma.emailDomain.findUnique({
    where: {
      domain,
    },
  });

  if (existingDomain) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'Domain already exists in database',
    });
  }

  const { publicKey, privateKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  const publicKeyFlattened = stripPemArmor(publicKey);
  const privateKeyFlattened = stripPemArmor(privateKey);

  const records = generateEmailDomainRecords(recordName, publicKeyFlattened);

  const encryptedPrivateKey = symmetricEncrypt({
    key: encryptionKey,
    data: privateKeyFlattened,
  });

  // Register the SES identity before writing to the DB so a failed AWS call
  // doesn't leave an orphaned domain row. Map the "already registered" case to
  // a friendly conflict error.
  await registerDomainIdentityWithDkim(domain, selector, privateKeyFlattened).catch((err) => {
    if (err.name === 'AlreadyExistsException') {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, {
        message: 'Domain already exists in SES',
      });
    }

    throw err;
  });

  const emailDomain = await prisma.emailDomain.create({
    data: {
      id: generateDatabaseId('email_domain'),
      domain,
      status: EmailDomainStatus.PENDING,
      organisationId,
      selector: recordName,
      publicKey: publicKeyFlattened,
      privateKey: encryptedPrivateKey,
    },
    select: {
      id: true,
      status: true,
      organisationId: true,
      domain: true,
      selector: true,
      publicKey: true,
      createdAt: true,
      updatedAt: true,
      lastVerifiedAt: true,
      emails: true,
    },
  });

  return {
    emailDomain,
    records,
  };
};
