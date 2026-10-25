import { createFileRoute } from '@tanstack/react-router';
import { docHead, loadDoc } from '../docs/head.ts';
import { DocPage, DocsNotFound } from '../docs/layout.tsx';

// TanStack types head's loaderData from loader, so loader must come first (react-doctor
// tanstack-start-route-property-order); the key sort would put it after head.
// oxlint-disable perfectionist/sort-objects
export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => loadDoc(params.slug),
  head: ({ loaderData, params }) => docHead(loaderData, params.slug),
  component: Doc,
  notFoundComponent: DocsNotFound,
});
// oxlint-enable perfectionist/sort-objects

function Doc() {
  const { slug } = Route.useParams();
  return <DocPage slug={slug} />;
}
