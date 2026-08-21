import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

/**
 * The corporate-assignment command grants organization ownership. It must stay
 * an operator command run with database credentials, and must never become a
 * public HTTP endpoint — including by accident, when someone adds a convenient
 * "bootstrap" route later.
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [full]
      : [];
  });
}

describe('the corporate assignment command is not an HTTP surface', () => {
  it('is imported by no route, server, or middleware module', () => {
    const offenders = [join(SRC, 'routes'), join(SRC, 'middleware')]
      .flatMap(sourceFiles)
      .concat(join(SRC, 'server.ts'))
      .filter((file) => /from\s+'.*operations\//.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('is not reachable at any plausible bootstrap path', async () => {
    app = await buildServer({ NODE_ENV: 'test' });
    const paths = [
      '/operations/assign-corporate-resource',
      '/platform/bootstrap',
      '/platform/tenants/mjcc/assign',
      '/create/bootstrap',
      '/admin/assign-corporate-resource',
      '/internal/assign',
    ];
    for (const url of paths) {
      for (const method of ['GET', 'POST'] as const) {
        const response = await app.inject({ method, url });
        expect([url, method, response.statusCode]).toEqual([url, method, 404]);
      }
    }
  });

  it('keeps the CLI entry point out of the served application bundle graph', () => {
    // apps/api builds from src/index.ts. The CLI is a separate entry point, so
    // nothing the HTTP server loads may import it.
    const serverGraphRoots = [join(SRC, 'index.ts'), join(SRC, 'server.ts')];
    for (const file of serverGraphRoots) {
      expect(readFileSync(file, 'utf8')).not.toContain('assign-corporate-resource');
    }
  });
});
