import { createFileRoute } from '@tanstack/react-router';
import { docHead, FIRST, loadDoc } from '../docs/head.ts';
import { DocPage } from '../docs/layout.tsx';

export const Route = createFileRoute('/docs/')({
  component: () => <DocPage slug={FIRST} />,
  head: ({ loaderData }) => docHead(loaderData),
  loader: () => loadDoc(FIRST),
});
