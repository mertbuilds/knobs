import { createFileRoute } from '@tanstack/react-router';
import { BlogLayout, BlogNotFound } from '../blog/layout.tsx';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
  notFoundComponent: BlogNotFound,
});
