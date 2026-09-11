import { AppError } from '@/domain/errors';
import type { Repositories } from './types';

/* ==========================================================================
   Repository registry (dependency injection). Bootstrap installs the local
   SQLite implementation; tests install an in-memory one; a future build can
   install API repositories (see ./api) without changing services or UI.
   ========================================================================== */

let current: Repositories | null = null;

export function setRepositories(repositories: Repositories): void {
  current = repositories;
}

export function getRepositories(): Repositories {
  if (!current) throw new AppError('loadFailed');
  return current;
}

/** Shorthand used by services: `repos().products.getAll()`. */
export const repos = getRepositories;

export type * from './types';
