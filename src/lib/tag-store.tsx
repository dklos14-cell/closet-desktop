import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getDb, newId, now, removeTag, saveDb, type Db } from '@/lib/db';
import type { Tag, TagKind } from '@/lib/tags';

type TagStore = {
  tags: Tag[];
  loading: boolean;
  /** Tags of one kind, in display order. */
  ofKind: (kind: TagKind) => Tag[];
  byId: Map<string, Tag>;
  addTag: (kind: TagKind, name: string) => Promise<Tag>;
  renameTag: (id: string, name: string) => Promise<void>;
  /** Also removes the tag from every item and outfit. */
  deleteTag: (id: string) => Promise<void>;
};

const TagContext = createContext<TagStore | null>(null);

const tagsOf = (db: Db): Tag[] =>
  [...db.tags]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map(({ id, kind, name, position }) => ({ id, kind: kind as TagKind, name, position }));

/** Checks a tag name like the database did: 1-40 characters, no duplicates within a group. */
function checkName(db: Db, kind: string, name: string, exceptId?: string) {
  if (name.length < 1 || name.length > 40) throw new Error('Tag names must be 1-40 characters.');
  const taken = db.tags.some((t) => t.kind === kind && t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`You already have a tag called "${name}".`);
}

/** Loads the tags once and shares them with every screen. */
export function TagProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDb().then((db) => {
      setTags(tagsOf(db));
      setLoading(false);
    });
  }, []);

  const addTag = useCallback(async (kind: TagKind, rawName: string) => {
    const name = rawName.trim();
    const db = await getDb();
    checkName(db, kind, name);
    const position = Math.max(0, ...db.tags.filter((t) => t.kind === kind).map((t) => t.position)) + 1;
    const tag = { id: newId(), kind, name, position };
    db.tags.push({ ...tag, created_at: now() });
    await saveDb();
    setTags(tagsOf(db));
    return tag;
  }, []);

  const renameTag = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim();
    const db = await getDb();
    const tag = db.tags.find((t) => t.id === id);
    if (!tag) throw new Error('This tag no longer exists.');
    checkName(db, tag.kind, name, id);
    tag.name = name;
    await saveDb();
    setTags(tagsOf(db));
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    const db = await getDb();
    removeTag(db, id);
    await saveDb();
    setTags(tagsOf(db));
  }, []);

  const value = useMemo<TagStore>(() => {
    const byId = new Map(tags.map((t) => [t.id, t]));
    return {
      tags,
      loading,
      byId,
      ofKind: (kind) => tags.filter((t) => t.kind === kind).sort((a, b) => a.position - b.position),
      addTag,
      renameTag,
      deleteTag,
    };
  }, [tags, loading, addTag, renameTag, deleteTag]);

  return <TagContext.Provider value={value}>{children}</TagContext.Provider>;
}

export function useTags(): TagStore {
  const store = useContext(TagContext);
  if (!store) throw new Error('useTags must be used inside <TagProvider>');
  return store;
}
