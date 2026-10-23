import { createFileRoute } from '@tanstack/react-router';
import { DocsLayout, DocsNotFound } from '../docs/layout.tsx';

export const Route = createFileRoute('/docs')({
  component: DocsLayout,
  notFoundComponent: DocsNotFound,
});
