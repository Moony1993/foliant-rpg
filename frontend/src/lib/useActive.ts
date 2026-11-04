import { useEffect } from 'react';
import { useCharacters, useCharacter } from './queries';
import { useActiveChar } from '../store/char';

/** Resolves the active character (from store, falling back to the first owned one). */
export function useActive() {
  const { activeId, setActive } = useActiveChar();
  const list = useCharacters();

  // Default to first character if none/invalid selected.
  useEffect(() => {
    if (!list.data) return;
    const valid = list.data.some((c) => c.id === activeId);
    if (!valid) setActive(list.data[0]?.id ?? null);
  }, [list.data, activeId, setActive]);

  const resolvedId = list.data?.some((c) => c.id === activeId) ? activeId : list.data?.[0]?.id ?? null;
  const character = useCharacter(resolvedId);
  return { list, character, activeId: resolvedId };
}
