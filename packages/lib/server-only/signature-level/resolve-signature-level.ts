import { AppError, AppErrorCode } from '../../errors/app-error';
import { SignatureLevel, type TSignatureLevel } from '../../types/signature-level';

type ResolveSignatureLevelOptions = {
  /**
   * The signature level the caller wants the envelope created at. Optional;
   * when omitted the resolver returns the UA-only default (`UA_KEP`).
   */
  requested?: TSignatureLevel;

  /**
   * When `true` (used at public/API call sites), a `requested` level other than
   * `UA_KEP` throws instead of being silently coerced, so callers cannot create
   * a non-Ukrainian envelope. When `false` (internal call sites such as
   * duplicate), an incompatible level is coerced to `UA_KEP`.
   */
  strict?: boolean;
};

/**
 * Resolve the signature level for a new envelope.
 *
 * VilnoEDO is UA-only: the only legally meaningful signing is Ukrainian
 * КЕП / УЕП / electronic seal, modelled as `UA_KEP`. Every new envelope is
 * created at `UA_KEP`; the upstream Documenso `SES`/`AES`/`QES` levels are not
 * offered. This is the single source of truth for the `Envelope.signatureLevel`
 * write at create-time — the column has no DB default by design.
 *
 * - `requested` omitted or `UA_KEP` → `UA_KEP`.
 * - `requested` is `SES`/`AES`/`QES` → throws in `strict` mode (public API);
 *   coerced to `UA_KEP` otherwise (internal callers).
 */
export const resolveSignatureLevel = ({
  requested,
  strict = false,
}: ResolveSignatureLevelOptions = {}): TSignatureLevel => {
  if (requested === undefined || requested === SignatureLevel.UA_KEP) {
    return SignatureLevel.UA_KEP;
  }

  if (strict) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `signatureLevel '${requested}' is not supported — VilnoEDO only supports the Ukrainian КЕП/УЕП/electronic-seal flow (UA_KEP).`,
    });
  }

  return SignatureLevel.UA_KEP;
};
