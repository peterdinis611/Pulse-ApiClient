import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-baseline gap-2">
          <span className="font-semibold tracking-tight">{appName}</span>
          <span className="text-xs font-medium text-fd-muted-foreground">docs</span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: 'Guide',
        url: '/docs',
      },
    ],
  };
}
