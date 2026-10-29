import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const { sitemapXml } = await import('../docs/sitemap.ts');
        return new Response(sitemapXml, {
          headers: {
            'cache-control': 'public, max-age=3600',
            'content-type': 'application/xml; charset=utf-8',
          },
        });
      },
    },
  },
});
