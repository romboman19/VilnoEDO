import { DEFAULT_DOCUMENT_TIME_ZONE } from '@documenso/lib/constants/time-zones';
import { DateTime } from 'luxon';
import { Canvas } from 'skia-canvas';

type CreateUaKepSignatureAppearanceImageOptions = {
  manifestSha256?: string | null;
  signedAt?: Date | string | null;
  signerInfo?: unknown;
  signingMethod?: string | null;
  timeZone?: string | null;
};

export const UA_KEP_SIGNING_METHOD_DISPLAY_LABELS: Record<string, string> = {
  'file-key': 'File QES/AES key',
  'iit-token': 'Hardware QES/AES key',
  'privatbank-smartid': 'Cloud signature PrivatBank SmartID',
  'diia-signature': 'Cloud signature Diia.Signature',
  depositsign: 'Cloud signature DepositSign',
  vchasno: 'Cloud signature Vchasno',
  vchasnoQR: 'Cloud signature Vchasno (QR)',
  cloudkey: 'Cloud signature CloudKey',
  esign: 'Cloud signature ESign',
  smartsigntax: 'Cloud signature State Tax Service',
  pumb: 'Cloud signature PUMB',
  ugb: 'Cloud signature Ukrgasbank EcoSign',
  alliance: 'Cloud signature Bank Alliance',
};

const getStringValue = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

export const getUaKepSignerCommonName = (signerInfo: unknown) => {
  if (!signerInfo || typeof signerInfo !== 'object') {
    return null;
  }

  const signerInfoRecord = signerInfo as Record<string, unknown>;

  return (
    getStringValue(signerInfoRecord.subjCN) ??
    getStringValue(signerInfoRecord.cryptoSignerCn) ??
    getStringValue(signerInfoRecord.certSubjectCn)
  );
};

export const getUaKepSigningMethodDisplayLabel = (signingMethod: string | null | undefined) => {
  if (signingMethod && UA_KEP_SIGNING_METHOD_DISPLAY_LABELS[signingMethod]) {
    return UA_KEP_SIGNING_METHOD_DISPLAY_LABELS[signingMethod];
  }

  return 'QES/AES';
};

export const formatUaKepSigningTime = (
  value: Date | string | null | undefined,
  timeZone: string | null | undefined,
) => {
  const zone = timeZone || DEFAULT_DOCUMENT_TIME_ZONE;

  if (!value) {
    return DateTime.now().setZone(zone).toFormat('yyyy-LL-dd HH:mm:ss ZZZZ');
  }

  const dateTime = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);

  if (!dateTime.isValid) {
    return typeof value === 'string' ? value : DateTime.now().setZone(zone).toFormat('yyyy-LL-dd HH:mm:ss ZZZZ');
  }

  return dateTime.setZone(zone).toFormat('yyyy-LL-dd HH:mm:ss ZZZZ');
};

export const createUaKepSignatureAppearanceImage = async ({
  manifestSha256,
  signedAt,
  signerInfo,
  signingMethod,
  timeZone,
}: CreateUaKepSignatureAppearanceImageOptions) => {
  const canvas = new Canvas(1040, 340);
  canvas.gpu = false;

  const context = canvas.getContext('2d');
  const signerName = getUaKepSignerCommonName(signerInfo) ?? 'Signer defined by the signature manifest';
  const signedAtText = formatUaKepSigningTime(signedAt, timeZone);
  const signingMethodLabel = getUaKepSigningMethodDisplayLabel(signingMethod);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#65a30d';
  context.lineWidth = 6;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  context.fillStyle = '#1f2937';
  context.font = '700 42px Arial, sans-serif';
  context.fillText('QES/AES', 44, 72);

  context.font = '600 30px Arial, sans-serif';
  context.fillText(`Signer: ${signerName}`, 44, 128, 952);

  context.fillStyle = '#4b5563';
  context.font = '25px Arial, sans-serif';
  context.fillText(`Signing time: ${signedAtText}`, 44, 184, 952);
  context.fillText(`Signed with: ${signingMethodLabel}`, 44, 232, 952);

  if (manifestSha256) {
    context.font = '20px Arial, sans-serif';
    context.fillText(`Manifest: ${manifestSha256.slice(0, 24)}`, 44, 284, 952);
  }

  const png = await canvas.toBuffer('png');

  return `data:image/png;base64,${png.toString('base64')}`;
};
