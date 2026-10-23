import { createFileRoute } from '@tanstack/react-router';
import { docHead, FIRST, loadDoc } from '../docs/head.ts';
import { DocPage } from '../docs/layout.tsx';

// TanStack types head's loaderData from loader, so loader must come first (react-doctor
// tanstack-start-route-property-order); the key sort would put it after head.
// oxlint-disable perfectionist/sort-objects
export const Route = createFileRoute('/docs/')({
  loader: () => loadDoc(FIRST),
  head: ({ loaderData }) => docHead(loaderData),
  component: () => <DocPage slug={FIRST} />,
});
// oxlint-enable perfectionist/sort-objects
