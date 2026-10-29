import { createFileRoute } from '@tanstack/react-router';
import { loadPost, postHead } from '../blog/head.ts';
import { BlogNotFound, PostPage } from '../blog/layout.tsx';

// TanStack types head's loaderData from loader, so loader must come first (react-doctor
// tanstack-start-route-property-order); the key sort would put it after head.
// oxlint-disable perfectionist/sort-objects
export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => loadPost(params.slug),
  head: ({ loaderData, params }) => postHead(loaderData, params.slug),
  component: Post,
  notFoundComponent: BlogNotFound,
});
// oxlint-enable perfectionist/sort-objects

function Post() {
  const { slug } = Route.useParams();
  return <PostPage slug={slug} />;
}
