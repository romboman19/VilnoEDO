import { mailer } from '@documenso/email/mailer';
import { OrganisationAccountLinkConfirmationTemplate } from '@documenso/email/templates/organisation-account-link-confirmation';
import { prisma } from '@documenso/prisma';
import { msg } from '@lingui/core/macro';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import { createElement } from 'react';

import { getI18nInstance } from '../../client-only/providers/i18n-server';
import { NEXT_PUBLIC_WEBAPP_URL } from '../../constants/app';
import { DOCUMENSO_INTERNAL_EMAIL } from '../../constants/email';
import { ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER } from '../../constants/organisations';
import { AppError, AppErrorCode } from '../../errors/app-error';
import type { TOrganisationAccountLinkMetadata } from '../../types/organisation';
import { renderEmailWithI18N } from '../../utils/render-email-with-i18n';
import { getEmailContext } from '../email/get-email-context';

export type SendOrganisationAccountLinkConfirmationEmailProps = TOrganisationAccountLinkMetadata & {
  organisationName: string;
};

const RESEND_THROTTLE_MINUTES = 5;
const TOKEN_TTL_MINUTES = 30;

/**
 * Mint a short-lived verification token and email the user a link to confirm
 * creating/linking their account against an organisation SSO provider.
 *
 * Throttled to one mail per {@link RESEND_THROTTLE_MINUTES} to avoid spamming.
 * The mail always goes through the trusted instance mailer/sender rather than
 * the organisation's own transport, so a misconfigured org transport can never
 * lock a user out of completing their own SSO linking.
 */
export const sendOrganisationAccountLinkConfirmationEmail = async ({
  type,
  userId,
  organisationId,
  organisationName,
  oauthConfig,
}: SendOrganisationAccountLinkConfirmationEmailProps) => {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
    },
    include: {
      verificationTokens: {
        where: {
          identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'User not found',
    });
  }

  const [previousVerificationToken] = user.verificationTokens;

  const wasRecentlySent =
    previousVerificationToken?.createdAt &&
    DateTime.fromJSDate(previousVerificationToken.createdAt).diffNow('minutes').minutes > -RESEND_THROTTLE_MINUTES;

  if (wasRecentlySent) {
    return;
  }

  const token = crypto.randomBytes(20).toString('hex');

  const createdToken = await prisma.verificationToken.create({
    data: {
      identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
      token,
      expires: DateTime.now().plus({ minutes: TOKEN_TTL_MINUTES }).toJSDate(),
      metadata: {
        type,
        userId,
        organisationId,
        oauthConfig,
      } satisfies TOrganisationAccountLinkMetadata,
      userId,
    },
  });

  // Only the resolved language is used here; the org's transport/sender are
  // intentionally ignored (see the function doc comment).
  const { emailLanguage } = await getEmailContext({
    emailType: 'INTERNAL',
    source: {
      type: 'organisation',
      organisationId,
    },
    meta: null,
  });

  const assetBaseUrl = NEXT_PUBLIC_WEBAPP_URL() || 'http://localhost:3000';
  const confirmationLink = `${assetBaseUrl}/organisation/sso/confirmation/${createdToken.token}`;

  const confirmationTemplate = createElement(OrganisationAccountLinkConfirmationTemplate, {
    type,
    assetBaseUrl,
    confirmationLink,
    organisationName,
  });

  const [html, text] = await Promise.all([
    renderEmailWithI18N(confirmationTemplate, { lang: emailLanguage }),
    renderEmailWithI18N(confirmationTemplate, { lang: emailLanguage, plainText: true }),
  ]);

  const i18n = await getI18nInstance(emailLanguage);

  return mailer.sendMail({
    to: {
      address: user.email,
      name: user.name || '',
    },
    from: DOCUMENSO_INTERNAL_EMAIL,
    subject: type === 'create' ? i18n._(msg`Account creation request`) : i18n._(msg`Account linking request`),
    html,
    text,
  });
};
