import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { i18n, type MessageDescriptor } from '@lingui/core';

export const appMetaTags = (title?: MessageDescriptor) => {
  const description = 'VilnoEDO is a modern document signing platform for Ukrainian electronic document workflows.';

  return [
    {
      title: title ? `${i18n._(title)} - VilnoEDO` : 'VilnoEDO',
    },
    {
      name: 'description',
      content: description,
    },
    {
      name: 'keywords',
      content: 'VilnoEDO, electronic document signing, КЕП, УЕП, document workflow',
    },
    {
      name: 'author',
      content: 'VilnoEDO',
    },
    {
      name: 'robots',
      content: 'index, follow',
    },
    {
      property: 'og:title',
      content: 'VilnoEDO',
    },
    {
      property: 'og:description',
      content: description,
    },
    {
      property: 'og:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:site',
      content: '@vilnoedo',
    },
    {
      name: 'twitter:description',
      content: description,
    },
    {
      name: 'twitter:image',
      content: `${NEXT_PUBLIC_WEBAPP_URL()}/opengraph-image.jpg`,
    },
  ];
};
