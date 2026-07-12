import { DocumentCompletedEmailTemplate } from '@documenso/email/templates/document-completed';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import { DocumentSource, EnvelopeType, RecipientRole } from '@prisma/client';
import { createElement } from 'react';

import { getI18nInstance } from '../../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../../constants/app';
import { getEmailContext } from '../../../server-only/email/get-email-context';
import { assertOrganisationRatesAndLimits } from '../../../server-only/rate-limit/assert-organisation-rates-and-limits';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../../types/document-audit-logs';
import { extractDerivedDocumentEmailSettings } from '../../../types/document-email';
import { getFileServerSide } from '../../../universal/upload/get-file.server';
import { createDocumentAuditLogData } from '../../../utils/document-audit-logs';
import { unsafeBuildEnvelopeIdQuery } from '../../../utils/envelope';
import { isRecipientEmailValidForSending } from '../../../utils/recipients';
import { renderCustomEmailTemplate } from '../../../utils/render-custom-email-template';
import { renderEmailWithI18N } from '../../../utils/render-email-with-i18n';
import { formatDocumentsPath } from '../../../utils/teams';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendDocumentCompletedEmailsJobDefinition } from './send-document-completed-emails';

type TCompletedDocumentEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: 'application/pdf';
};

const sanitizeDownloadName = (name: string) => {
  const sanitized = Array.from(name, (char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  return sanitized || 'document';
};

export const run = async ({ payload, io }: { payload: TSendDocumentCompletedEmailsJobDefinition; io: JobRunIO }) => {
  const { envelopeId, requestMetadata } = payload;

  const envelope = await prisma.envelope.findUnique({
    where: unsafeBuildEnvelopeIdQuery({ type: 'envelopeId', id: envelopeId }, EnvelopeType.DOCUMENT),
    include: {
      envelopeItems: {
        include: {
          documentData: {
            select: {
              type: true,
              id: true,
              data: true,
            },
          },
        },
      },
      documentMeta: true,
      recipients: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          disabled: true,
        },
      },
      team: {
        select: {
          id: true,
          url: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Document not found');
  }

  const isDirectTemplate = envelope?.source === DocumentSource.TEMPLATE_DIRECT_LINK;

  if (envelope.recipients.length === 0) {
    throw new Error('Document has no recipients');
  }

  const { branding, emailLanguage, senderEmail, replyToEmail, organisationId, claims, emailsDisabled, emailTransport } =
    await getEmailContext({
      emailType: 'RECIPIENT',
      source: {
        type: 'team',
        teamId: envelope.teamId,
      },
      meta: envelope.documentMeta,
    });

  // Don't send completion emails if the organisation has email sending disabled or the owner is disabled (e.g. banned).
  if (envelope.user.disabled || emailsDisabled) {
    return;
  }

  const { user: owner } = envelope;

  const standardCompletedDocumentEmailAttachments = await Promise.all(
    envelope.envelopeItems.map(async (envelopeItem) => {
      const file = await getFileServerSide(envelopeItem.documentData);

      // Use the envelope title for version 1, and the envelope item title for version 2.
      const fileNameToUse = envelope.internalVersion === 1 ? envelope.title : `${envelopeItem.title}.pdf`;

      return {
        filename: fileNameToUse.endsWith('.pdf') ? fileNameToUse : `${fileNameToUse}.pdf`,
        content: Buffer.from(file),
        contentType: 'application/pdf',
      } satisfies TCompletedDocumentEmailAttachment;
    }),
  );

  const standardAttachmentsByEnvelopeItemId = new Map(
    envelope.envelopeItems.map((envelopeItem, index) => [
      envelopeItem.id,
      standardCompletedDocumentEmailAttachments[index],
    ]),
  );

  const uaKepEvidencePackages = await prisma.uaKepEvidencePackage.findMany({
    where: {
      envelopeId: envelope.id,
    },
    select: {
      id: true,
      recipientId: true,
      uaKepSessionId: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const uaKepPadesArtifacts =
    uaKepEvidencePackages.length > 0
      ? await prisma.uaKepSignatureArtifact.findMany({
          where: {
            uaKepSessionId: {
              in: uaKepEvidencePackages.map((evidencePackage) => evidencePackage.uaKepSessionId),
            },
            artifactType: { startsWith: 'PADES' },
          },
          select: {
            uaKepSessionId: true,
            envelopeItemId: true,
            signatureBase64: true,
            envelopeItem: {
              select: {
                title: true,
              },
            },
          },
          orderBy: [{ envelopeItemId: 'asc' }, { artifactType: 'asc' }],
        })
      : [];

  const uaKepPadesArtifactsBySessionId = new Map<string, typeof uaKepPadesArtifacts>();

  for (const artifact of uaKepPadesArtifacts) {
    const artifacts = uaKepPadesArtifactsBySessionId.get(artifact.uaKepSessionId) ?? [];

    artifacts.push(artifact);
    uaKepPadesArtifactsBySessionId.set(artifact.uaKepSessionId, artifacts);
  }

  const getCompletedDocumentEmailContent = ({ recipientId }: { recipientId?: number }) => {
    const evidencePackage =
      uaKepEvidencePackages.find((evidencePackage) => evidencePackage.recipientId === recipientId) ??
      uaKepEvidencePackages[0];

    if (!evidencePackage) {
      return {
        attachments: standardCompletedDocumentEmailAttachments,
        completedVariant: 'standard' as const,
      };
    }

    const padesArtifacts = uaKepPadesArtifactsBySessionId.get(evidencePackage.uaKepSessionId) ?? [];

    if (padesArtifacts.length === 0) {
      return {
        attachments: standardCompletedDocumentEmailAttachments,
        completedVariant: 'ua-kep-evidence' as const,
      };
    }

    const padesArtifactsByEnvelopeItemId = new Map(
      padesArtifacts.map((artifact) => [artifact.envelopeItemId, artifact]),
    );

    return {
      attachments: envelope.envelopeItems.map((envelopeItem) => {
        const padesArtifact = padesArtifactsByEnvelopeItemId.get(envelopeItem.id);
        const standardAttachment = standardAttachmentsByEnvelopeItemId.get(envelopeItem.id);

        if (!padesArtifact) {
          if (!standardAttachment) {
            throw new Error(`Missing completed document attachment for envelope item ${envelopeItem.id}`);
          }

          return standardAttachment;
        }

        return {
          filename: `${sanitizeDownloadName(padesArtifact.envelopeItem.title)}-pades.pdf`,
          content: Buffer.from(padesArtifact.signatureBase64.replace(/\s/g, ''), 'base64'),
          contentType: 'application/pdf',
        } satisfies TCompletedDocumentEmailAttachment;
      }),
      completedVariant: 'ua-kep-pades' as const,
    };
  };

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';

  let documentOwnerDownloadLink = `${NEXT_PUBLIC_WEBAPP_URL()}${formatDocumentsPath(
    envelope.team?.url,
  )}/${envelope.id}`;

  if (envelope.team?.url) {
    documentOwnerDownloadLink = `${NEXT_PUBLIC_WEBAPP_URL()}/t/${envelope.team.url}/documents/${envelope.id}`;
  }

  const emailSettings = extractDerivedDocumentEmailSettings(envelope.documentMeta);
  const isDocumentCompletedEmailEnabled = emailSettings.documentCompleted;
  const isOwnerDocumentCompletedEmailEnabled = emailSettings.ownerDocumentCompleted;

  // Send email to document owner if:
  // 1. Owner document completed emails are enabled AND
  // 2. Either:
  //    - The owner is not a recipient, OR
  //    - Recipient emails are disabled
  if (
    isOwnerDocumentCompletedEmailEnabled &&
    (!envelope.recipients.find((recipient) => recipient.email === owner.email) || !isDocumentCompletedEmailEnabled)
  ) {
    const ownerRecipient = envelope.recipients.find((recipient) => recipient.email === owner.email);
    const completedDocumentEmailContent = getCompletedDocumentEmailContent({
      recipientId: ownerRecipient?.id,
    });

    const template = createElement(DocumentCompletedEmailTemplate, {
      documentName: envelope.title,
      assetBaseUrl,
      downloadLink: documentOwnerDownloadLink,
      completedVariant: completedDocumentEmailContent.completedVariant,
    });

    const [html, text] = await Promise.all([
      renderEmailWithI18N(template, { lang: emailLanguage, branding }),
      renderEmailWithI18N(template, {
        lang: emailLanguage,
        branding,
        plainText: true,
      }),
    ]);

    const i18n = await getI18nInstance(emailLanguage);

    await emailTransport.sendMail({
      to: [
        {
          name: owner.name || '',
          address: owner.email,
        },
      ],
      from: senderEmail,
      replyTo: replyToEmail,
      subject: i18n._(msg`Signing Complete!`),
      html,
      text,
      attachments: completedDocumentEmailContent.attachments,
    });

    await prisma.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
        envelopeId: envelope.id,
        user: null,
        requestMetadata,
        data: {
          emailType: 'DOCUMENT_COMPLETED',
          recipientEmail: owner.email,
          recipientName: owner.name ?? '',
          recipientId: owner.id,
          recipientRole: 'OWNER',
          isResending: false,
        },
      }),
    });
  }

  if (!isDocumentCompletedEmailEnabled) {
    return;
  }

  const recipientsToNotify = envelope.recipients.filter((recipient) => isRecipientEmailValidForSending(recipient));

  await Promise.all(
    recipientsToNotify.map(async (recipient) => {
      // A CC recipient never asked to be part of this document, so their completion
      // email is effectively unsolicited. Meter it against the organisation email
      // quota/stats so it is correctly logged.
      if (recipient.role === RecipientRole.CC) {
        try {
          await assertOrganisationRatesAndLimits({
            organisationId,
            organisationClaim: claims,
            type: 'email',
            count: 1,
          });
        } catch (_err) {
          io.logger.warn({
            msg: 'CC completion email dropped: org email limit exceeded',
            organisationId,
            recipientId: recipient.id,
            envelopeId: envelope.id,
          });

          // On rate/quota exceeded, early return to allow other recipients to be processed.
          return;
        }
      }

      const customEmailTemplate = {
        'signer.name': recipient.name,
        'signer.email': recipient.email,
        'document.name': envelope.title,
      };

      const downloadLink = `${NEXT_PUBLIC_WEBAPP_URL()}/sign/${recipient.token}/complete`;
      const reportUrl =
        recipient.role === RecipientRole.CC ? `${NEXT_PUBLIC_WEBAPP_URL()}/report/${recipient.token}` : undefined;
      const completedDocumentEmailContent = getCompletedDocumentEmailContent({
        recipientId: recipient.id,
      });

      const template = createElement(DocumentCompletedEmailTemplate, {
        documentName: envelope.title,
        assetBaseUrl,
        downloadLink: recipient.email === owner.email ? documentOwnerDownloadLink : downloadLink,
        completedVariant: completedDocumentEmailContent.completedVariant,
        customBody:
          isDirectTemplate && envelope.documentMeta?.message
            ? renderCustomEmailTemplate(envelope.documentMeta.message, customEmailTemplate)
            : undefined,
        reportUrl,
      });

      const [html, text] = await Promise.all([
        renderEmailWithI18N(template, { lang: emailLanguage, branding }),
        renderEmailWithI18N(template, {
          lang: emailLanguage,
          branding,
          plainText: true,
        }),
      ]);

      const i18n = await getI18nInstance(emailLanguage);

      await emailTransport.sendMail({
        to: [
          {
            name: recipient.name,
            address: recipient.email,
          },
        ],
        from: senderEmail,
        replyTo: replyToEmail,
        subject:
          isDirectTemplate && envelope.documentMeta?.subject
            ? renderCustomEmailTemplate(envelope.documentMeta.subject, customEmailTemplate)
            : i18n._(msg`Signing Complete!`),
        html,
        text,
        attachments: completedDocumentEmailContent.attachments,
      });

      await prisma.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
          envelopeId: envelope.id,
          user: null,
          requestMetadata,
          data: {
            emailType: 'DOCUMENT_COMPLETED',
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            recipientId: recipient.id,
            recipientRole: recipient.role,
            isResending: false,
          },
        }),
      });
    }),
  );
};
