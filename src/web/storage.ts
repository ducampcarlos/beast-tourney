/**
 * Where the player's progress lives. There is no server and no account: everything stays in the
 * browser. Each value is written to `localStorage` (it outlives the tab) and mirrored to
 * `sessionStorage` (it survives a reload of this tab even if the first is blocked, full or
 * cleared) and to memory (so the game still remembers within the page when storage is refused
 * altogether). Reading prefers the persistent copy. Every access is wrapped: browsers throw on
 * private windows, blocked cookies and full quotas.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Store {
  get(key: string): string | null;
  /** Save a value, or forget the key with `null`. */
  set(key: string, value: string | null): void;
  /** False while the browser refuses to keep anything beyond this tab. */
  readonly persistent: boolean;
}

export function makeStore(local: () => StorageLike | undefined, session: () => StorageLike | undefined): Store {
  const memory = new Map<string, string>();
  let persistent = true;
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  return {
    get persistent() {
      return persistent;
    },
    get(key) {
      return attempt(() => local()?.getItem(key) ?? null) ?? attempt(() => session()?.getItem(key) ?? null) ?? memory.get(key) ?? null;
    },
    set(key, value) {
      if (value === null) {
        memory.delete(key);
        attempt(() => local()?.removeItem(key));
        attempt(() => session()?.removeItem(key));
        return;
      }
      memory.set(key, value);
      const saved = attempt(() => {
        const storage = local();
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
      });
      persistent = saved === true;
      attempt(() => session()?.setItem(key, value));
    },
  };
}

/** The store the game uses. */
export const store: Store = makeStore(() => window.localStorage, () => window.sessionStorage);
