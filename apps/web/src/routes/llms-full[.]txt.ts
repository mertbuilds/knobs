import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        const { llmsFullTxt, textResponse } = await import('../docs/llms.ts');
        return textResponse(llmsFullTxt);
      },
    },
  },
});
