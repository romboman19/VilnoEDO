/// GET /api/ua-trusted-signing/status
///
/// Reports the Ukrainian trusted-signing posture. VilnoEDO is UA-only: the
/// legally meaningful signature is the Ukrainian КЕП/УЕП/electronic seal created
/// client-side via the IIT stack. The upstream Documenso instance `.p12` server
/// seal is not part of this flow and is reported as disabled.
///
/// `iitServerValidation*` reflects that only the in-process structural
/// pre-check runs today; full cryptographic validation via the licensed IIT
/// library is not yet wired, so it is not required.
export const loader = () => {
  return Response.json({
    uaTrustedSigningEnabled: true,
    iitClientSigningEnabled: true,
    iitServerValidationEnabled: false,
    iitServerValidationRequired: false,
    validationMode: 'structural_precheck',
    allowedFormats: ['CADES_DETACHED'],
    allowSignatures: true,
    allowSeals: true,
    documensoServerSealEnabled: false,
    timestamp: new Date().toISOString(),
  });
};
