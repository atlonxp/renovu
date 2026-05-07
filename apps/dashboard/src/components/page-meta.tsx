import { Helmet } from 'react-helmet-async';

const DEFAULT_DESCRIPTION =
  'ReNOVU is a self-hosted notification platform — a custom fork of NOVU with enterprise features unlocked, AI-powered translations, multi-project workspaces, and admin tooling tailored for self-hosted deployments.';

type Props = {
  title?: string;
  description?: string;
};

export function PageMeta({ title, description }: Props) {
  const pageTitle = title ? `${title} | ReNOVU` : 'ReNOVU';
  const pageDescription = description || DEFAULT_DESCRIPTION;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
    </Helmet>
  );
}
