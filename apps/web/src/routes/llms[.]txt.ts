import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { llmsTxt, textResponse } = await import('../docs/llms.ts');
        return textResponse(llmsTxt);
      },
    },
  },
});
