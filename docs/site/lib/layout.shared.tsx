import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="pulse-brand">
          <span className="pulse-brand__mark" aria-hidden />
          <span className="font-semibold tracking-tight">{appName}</span>
          <em>manual</em>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: 'Guide',
        url: '/docs',
      },
      {
        text: 'Requests',
        url: '/docs/workspace/requests',
      },
    ],
  };
}
