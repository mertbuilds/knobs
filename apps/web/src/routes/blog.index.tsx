import { createFileRoute } from '@tanstack/react-router';
import { blogIndexHead } from '../blog/head.ts';
import { BlogIndex } from '../blog/layout.tsx';

export const Route = createFileRoute('/blog/')({
  component: BlogIndex,
  head: blogIndexHead,
});
