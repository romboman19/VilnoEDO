import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

const CHECK_COLOR = 'var(--ve-brand-green, #7ed957)';

export const BrandingLogoIcon = ({ ...props }: LogoProps) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 84" role="img" aria-label="VilnoEDO" {...props}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="4.8" d="M14 9.5h34.6L65 25.8V73H14z" />
        <path strokeWidth="4.8" d="M48.6 9.5V28H65" />
        <path strokeWidth="3.8" d="M23.6 28.5h14.2" />
        <path strokeWidth="3.8" d="M23.6 38h14.2" />
        <path
          strokeWidth="4.4"
          d="M22.4 59.6c6.2-8.9 13.4-20 18.1-14.2 4.4 5.5-6.8 17.3-16.3 19.7 8.1-2.9 13.7-7.4 19.7-2.1 4.7 4.1 7.3.5 12.5-2.1 5-2.4 9.5 1.3 14.6 1.1"
        />
        <path strokeWidth="4.8" d="M14 73h35.6" />
      </g>

      <g fill="none" stroke={CHECK_COLOR} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="70.4" cy="58.4" r="16.2" strokeWidth="4.8" />
        <path strokeWidth="5" d="m62 58.4 6.2 6.2 11.2-12.6" />
      </g>
    </svg>
  );
};
