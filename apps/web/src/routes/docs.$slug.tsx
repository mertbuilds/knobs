import { createFileRoute } from '@tanstack/react-router';
import { docHead, loadDoc } from '../docs/head.ts';
import { DocPage, DocsNotFound } from '../docs/layout.tsx';

export const Route = createFileRoute('/docs/$slug')({
  component: Doc,
  head: ({ loaderData }) => docHead(loaderData),
  loader: ({ params }) => loadDoc(params.slug),
  notFoundComponent: DocsNotFound,
});

function Doc() {
  const { slug } = Route.useParams();
  return <DocPage slug={slug} />;
}
