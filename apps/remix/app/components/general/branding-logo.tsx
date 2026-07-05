import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

const CHECK_COLOR = 'var(--ve-brand-green, #7ed957)';

export const BrandingLogo = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2248 320" role="img" aria-label="VilnoEDO" {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="18" d="M84 38h132l62 62v180H84z" />
        <path strokeWidth="18" d="M216 38v70h62" />
        <path strokeWidth="15" d="M120 108h54" />
        <path strokeWidth="15" d="M120 144h54" />
        <path
          strokeWidth="17"
          d="M116 226c24-34 51-76 69-54 17 21-26 66-62 75 31-11 52-28 75-8 18 16 28 2 48-8 19-9 36 5 56 4"
        />
        <path strokeWidth="18" d="M84 280h136" />
      </g>

      <g fill="none" stroke={CHECK_COLOR} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="268" cy="222" r="62" strokeWidth="18" />
        <path strokeWidth="19" d="m236 222 24 24 43-48" />
      </g>

      <text
        x="430"
        y="214"
        fill="currentColor"
        fontFamily="Inter, Arial, Helvetica, sans-serif"
        fontSize="184"
        fontWeight="760"
        letterSpacing="0"
      >
        VilnoEDO
      </text>
    </svg>
  );
};
