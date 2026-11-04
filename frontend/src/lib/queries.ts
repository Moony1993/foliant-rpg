import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useCampaignStore } from '../store/campaign';
import { useSpellClass } from '../store/char';
import { detectGrid } from './gridDetect';
import type {
  Character, CharacterInput, ClassFeature, Companion, CompanionInput, CompendiumSpell, EquipSlot, Feat,
  GmCharacter, ItemTemplate, Message, Monster, MonsterInput, Note, NoteInput, PlayerSummary, RaceDef, Skill, SkillInput, SkillSheet, Spell, SpellInput,
  SpellSlot, Spellbook, SpellState, StatusEffect, StatusEffectInput, Ammo, WeaponDef, BattleMap, MapAsset,
  ChatMessage, PollAnswer, SchedulePoll, CampaignSummary, CampaignDetail, CampaignInvite, RuleSystemInfo, RuleLayout, DerivedStats as Derived } from './types';

export const useRaces = () =>
  useQuery({ queryKey: ['races'], staleTime: Infinity, queryFn: async () => (await api.get<RaceDef[]>('/rules/races')).data });

export const useWeapons = () =>
  useQuery({ queryKey: ['weapons'], staleTime: Infinity, queryFn: async () => (await api.get<WeaponDef[]>('/rules/weapons')).data });

export const useRuleSkills = () =>
  useQuery({ queryKey: ['rule-skills'], staleTime: Infinity, queryFn: async () => (await api.get<{ key: string; name: string }[]>('/rules/skills')).data });

export const useClassFeatures = (className: string) =>
  useQuery({
    queryKey: ['features', className],
    enabled: !!className,
    staleTime: Infinity,
    queryFn: async () => (await api.get<ClassFeature[]>(`/rules/features/${className}`)).data,
  });

/** Features of all of a character's classes as one list, each level shifted so that "feature.level <= character
 *  level" holds exactly when it is gained in its class (for prerequisite checks). undefined while loading. */
export function useAllClassFeatures(classes: { classId: string; level: number }[], level: number) {
  const results = useQueries({
    queries: classes.map((x) => ({
      queryKey: ['features', x.classId],
      enabled: !!x.classId,
      staleTime: Infinity,
      queryFn: async () => (await api.get<ClassFeature[]>(`/rules/features/${x.classId}`)).data,
    })),
  });
  if (classes.length === 0 || results.some((r) => !r.data)) return undefined;
  return results.flatMap((r, i) => r.data!.map((f) => ({ ...f, level: f.level + level - classes[i].level })));
}

// ---- Characters ----
export const useCharacters = () =>
  useQuery({ queryKey: ['characters'], queryFn: async () => (await api.get<Character[]>('/characters')).data });

export const useCharacter = (id: number | null) =>
  useQuery({
    queryKey: ['character', id],
    enabled: id != null,
    queryFn: async () => (await api.get<Character>(`/characters/${id}`)).data,
  });

export function useSaveCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: CharacterInput }) =>
      id
        ? (await api.put<Character>(`/characters/${id}`, input)).data
        : (await api.post<Character>('/characters', input)).data,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['characters'] });
      qc.setQueryData(['character', c.id], c);
    },
  });
}

// ---- Inventory ----
export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/characters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  });
}

export function useAddItem(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { itemTemplateId: number; quantity: number; gridIndex: number }) =>
      (await api.post(`/inventory/${charId}/items`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['character', charId] }),
  });
}

export function useMoveItem(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { inventoryItemId: number; gridIndex: number }) =>
      api.put(`/inventory/${charId}/move`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['character', charId] }),
  });
}

export function useDeleteItem(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inventoryItemId: number) =>
      api.delete(`/inventory/${charId}/items/${inventoryItemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['character', charId] }),
  });
}

export const useFeats = (search: string, type: string) =>
  useQuery({
    queryKey: ['feats', search, type],
    queryFn: async () =>
      (await api.get<Feat[]>('/feats', { params: { search: search || undefined, type: type || undefined } })).data,
  });

export function useCreateFeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; type: string; prerequisites: string; benefit: string }) =>
      (await api.post<Feat>('/feats', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feats'] }),
  });
}

export function useDeleteFeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/feats/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feats'] }); qc.invalidateQueries({ queryKey: ['character'] }); },
  });
}

export function useSetFeat(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { featId: number; add: boolean; choice?: string | null }) =>
      (await api.patch(`/characters/${charId}/feats`, body)).data,
    onSuccess: () => {
      // Feats change derived stats, skill totals (Skill Focus, Alertness …) and spell DCs.
      for (const key of ['character', 'skillsheet', 'spellbook'])
        qc.invalidateQueries({ queryKey: [key, charId] });
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useSetResource(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { key: string; used: number }) =>
      (await api.patch<Character>(`/characters/${charId}/resources`, body)).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      qc.invalidateQueries({ queryKey: ['spellbook', charId] });   // bardic performance shares the spellbook state
    },
  });
}

/** Rest (8 h): daily resources, spell slots and bardic performance back to full. */
export function useRest(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    // kind "short": only what comes back on a short rest (rule packages); otherwise a full rest.
    mutationFn: async (kind?: 'short' | 'long') =>
      (await api.post<Character>(`/characters/${charId}/rest`, null, { params: kind ? { kind } : {} })).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      qc.invalidateQueries({ queryKey: ['spellbook', charId] });
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useSetToggle(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { key: string; active: boolean }) =>
      (await api.patch<Character>(`/characters/${charId}/toggles`, body)).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      // Rage changes Str/Con: skills and spell slots follow.
      for (const key of ['skillsheet', 'spellbook', 'spellslots']) qc.invalidateQueries({ queryKey: [key, charId] });
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useSetAbilityIncreases(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (abilities: string[]) =>
      (await api.patch(`/characters/${charId}/ability-increases`, { abilities })).data,
    onSuccess: () => {
      // Scores feed everything: skills, spell slots/DCs, companions (familiar HP).
      for (const key of ['character', 'skillsheet', 'spellbook', 'spellslots', 'companions'])
        qc.invalidateQueries({ queryKey: [key, charId] });
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useSetFeatureChoice(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { feature: string; option: string | null }) =>
      (await api.patch(`/characters/${charId}/feature-choice`, body)).data,
    onSuccess: () => {
      // Feature choices drive feat slots, spell slots/lists and class companions — refresh all of them.
      for (const key of ['character', 'spellbook', 'spellslots', 'companions', 'companion-kinds'])
        qc.invalidateQueries({ queryKey: [key, charId] });
      qc.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

// ---- Equipment ----
export function useEquip(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { inventoryItemId: number; slot: EquipSlot }) =>
      (await api.post<Character>(`/equipment/${charId}/equip`, body)).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      // Gear changes armor check penalty (skills), casting ability items (spell slots/DCs), familiar HP.
      for (const key of ['skillsheet', 'spellbook', 'spellslots', 'companions']) qc.invalidateQueries({ queryKey: [key, charId] });
    },
  });
}

export function useUnequip(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { inventoryItemId: number }) =>
      (await api.post<Character>(`/equipment/${charId}/unequip`, body)).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      // Gear changes armor check penalty (skills), casting ability items (spell slots/DCs), familiar HP.
      for (const key of ['skillsheet', 'spellbook', 'spellslots', 'companions']) qc.invalidateQueries({ queryKey: [key, charId] });
    },
  });
}

export function useUseItem(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inventoryItemId: number) =>
      (await api.post<Character>(`/inventory/${charId}/items/${inventoryItemId}/use`)).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      qc.invalidateQueries({ queryKey: ['status', charId] });
    },
  });
}

// ---- GM ----
export const usePlayers = () =>
  useQuery({ queryKey: ['players'], queryFn: async () => (await api.get<PlayerSummary[]>('/gm/players')).data });

export const useItemTemplates = () =>
  useQuery({ queryKey: ['gm-items'], queryFn: async () => (await api.get<ItemTemplate[]>('/gm/items')).data });

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { username: string; tempPassword: string; displayName?: string; role: string }) =>
      (await api.post('/gm/accounts', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/gm/accounts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) =>
      (await api.post(`/gm/accounts/${id}/reset-password`, { newPassword })).data,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<ItemTemplate>) => (await api.post('/gm/items', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-items'] }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<ItemTemplate> }) =>
      (await api.put(`/gm/items/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-items'] }),
  });
}

export const useMonsters = () =>
  useQuery({ queryKey: ['gm-monsters'], queryFn: async () => (await api.get<Monster[]>('/gm/monsters')).data });

export function useCreateMonster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MonsterInput) => (await api.post<Monster>('/gm/monsters', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-monsters'] }),
  });
}

export function useUpdateMonster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: MonsterInput }) =>
      (await api.put<Monster>(`/gm/monsters/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-monsters'] }),
  });
}

export function useDeleteMonster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/gm/monsters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-monsters'] }),
  });
}

export function useAdjustMonsterHp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, delta }: { id: number; delta: number }) =>
      (await api.post<Monster>(`/gm/monsters/${id}/hp`, { delta })).data,
    onSuccess: (updated) =>
      qc.setQueryData<Monster[]>(['gm-monsters'], (old) =>
        old ? old.map((m) => (m.id === updated.id ? updated : m)) : old),
  });
}

export function useGrantItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { itemTemplateId: number; quantity: number; characterIds: number[]; toAll: boolean; unidentified?: boolean }) =>
      (await api.post('/gm/grant', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-characters'] }),
  });
}

export const useGmCharacters = () =>
  useQuery({ queryKey: ['gm-characters'], queryFn: async () => (await api.get<GmCharacter[]>('/gm/characters')).data });

export function useIdentifyItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inventoryItemId, identified }: { inventoryItemId: number; identified: boolean }) =>
      api.post(`/gm/inventory/${inventoryItemId}/identify`, { identified }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gm-characters'] }),
  });
}

/** Deletes the template from the system, incl. every inventory instance of it. */
export function useDeleteItemTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/gm/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gm-items'] });
      qc.invalidateQueries({ queryKey: ['gm-characters'] });
      qc.invalidateQueries({ queryKey: ['gm-monsters'] });
    },
  });
}

export function useBugReport() {
  return useMutation({
    mutationFn: async (body: { text: string; page: string }) => (await api.post('/messages/bug-report', body)).data,
  });
}

export function useGrantGold() {
  return useMutation({
    mutationFn: async (body: { amount: number; recipientUserIds: string[]; toAll: boolean }) =>
      (await api.post('/gm/gold', body)).data,
  });
}

// ---- Skills ----
export const useSkills = (charId: number | null) =>
  useQuery({
    queryKey: ['skills', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<Skill[]>(`/characters/${charId}/skills`)).data,
  });

export function useSaveSkill(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: SkillInput }) =>
      id
        ? (await api.put(`/characters/${charId}/skills/${id}`, input)).data
        : (await api.post(`/characters/${charId}/skills`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', charId] }),
  });
}

export function useDeleteSkill(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/characters/${charId}/skills/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', charId] }),
  });
}

export function useUnlockSkill(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/characters/${charId}/skills/${id}/unlock`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills', charId] }),
  });
}

// ---- Spells ----
export const useSpells = (charId: number | null) =>
  useQuery({
    queryKey: ['spells', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<Spell[]>(`/characters/${charId}/spells`)).data,
  });

export const useSpellSlots = (charId: number | null) =>
  useQuery({
    queryKey: ['spellslots', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<SpellSlot[]>(`/characters/${charId}/spellslots`)).data,
  });

export function useSaveSpell(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: SpellInput }) =>
      id
        ? (await api.put(`/characters/${charId}/spells/${id}`, input)).data
        : (await api.post(`/characters/${charId}/spells`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spells', charId] }),
  });
}

export function useDeleteSpell(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/characters/${charId}/spells/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spells', charId] });
      qc.invalidateQueries({ queryKey: ['spellbook', charId] }); // a prepared copy may have vanished
    },
  });
}

// ---- Ammunition ----
export const useAmmo = (charId: number | null) =>
  useQuery({
    queryKey: ['ammo', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<Ammo[]>(`/characters/${charId}/ammo`)).data,
  });

/** Saves the whole list. Optimistic, so counting shots at the table feels instant. */
export function useSaveAmmo(charId: number) {
  const qc = useQueryClient();
  const key = ['ammo', charId];
  return useMutation({
    mutationFn: async (ammo: Ammo[]) => (await api.put<Ammo[]>(`/characters/${charId}/ammo`, ammo)).data,
    onMutate: (ammo) => qc.setQueryData(key, ammo),
    onSuccess: (ammo) => qc.setQueryData(key, ammo),
    onError: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---- Spell tracker ----
/** The open spellbook's class (characters with several casting classes); '' = the first class that casts. */
export const useOpenSpellClass = (charId: number | null) => useSpellClass((s) => (charId == null ? '' : s.byChar[charId] ?? ''));
const bookQuery = (classId: string) => (classId ? `?classId=${encodeURIComponent(classId)}` : '');

/** The open spellbook (see useOpenSpellClass); the server falls back to the first book for an unknown class. */
export function useSpellbook(charId: number | null) {
  const classId = useOpenSpellClass(charId);
  return useQuery({
    queryKey: ['spellbook', charId, classId],
    enabled: charId != null,
    queryFn: async () => (await api.get<Spellbook>(`/characters/${charId}/spellbook${bookQuery(classId)}`)).data,
  });
}

/** Saves the open book's tracker state. Optimistic, so casting at the table feels instant. */
export function useSaveSpellbook(charId: number) {
  const qc = useQueryClient();
  const classId = useOpenSpellClass(charId);
  const key = ['spellbook', charId, classId];
  return useMutation({
    mutationFn: async (state: SpellState) => (await api.put<Spellbook>(`/characters/${charId}/spellbook${bookQuery(classId)}`, state)).data,
    onMutate: (state) => qc.setQueryData<Spellbook>(key, (old) => (old ? { ...old, state } : old)),
    onSuccess: (book) => {
      qc.setQueryData(key, book);
      qc.invalidateQueries({ queryKey: ['spellslots', charId] });
      if (book.shared) qc.invalidateQueries({ queryKey: ['spellbook', charId] });   // the other books show the same pool
    },
    onError: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---- Skill sheet (PF1e ranked skills) ----
export const useSkillSheet = (charId: number | null) =>
  useQuery({
    queryKey: ['skillsheet', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<SkillSheet>(`/characters/${charId}/skillsheet`)).data,
  });

export function useSetRank(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { skillKey: string; ranks: number }) =>
      (await api.put<SkillSheet>(`/characters/${charId}/skillsheet`, body)).data,
    onSuccess: (sheet) => {
      qc.setQueryData(['skillsheet', charId], sheet);
      qc.invalidateQueries({ queryKey: ['character', charId] }); // passive perception may change
    },
  });
}

// ---- Companions ----
export const useCompanions = (charId: number | null) =>
  useQuery({
    queryKey: ['companions', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<Companion[]>(`/characters/${charId}/companions`)).data,
  });

/** Class companion kinds the character may have now (from class + feature choices). */
export const useCompanionKinds = (charId: number) =>
  useQuery({
    queryKey: ['companion-kinds', charId],
    queryFn: async () => (await api.get<string[]>(`/characters/${charId}/companions/kinds`)).data,
  });

export function useAddCompanion(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanionInput) => (await api.post(`/characters/${charId}/companions`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companions', charId] }),
  });
}

export function useDeleteCompanion(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/characters/${charId}/companions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['companions', charId] }),
  });
}

// ---- Spell compendium ----
export const useCompendiumSpells = (className: string, search: string, coreOnly = false) =>
  useQuery({
    queryKey: ['compendium', className, search, coreOnly],
    enabled: !!className,
    queryFn: async () =>
      (await api.get<CompendiumSpell[]>('/compendium/spells', { params: { className, search: search || undefined, coreOnly: coreOnly || undefined } })).data,
  });

/** Share a homebrew spell in the compendium (visible to everyone with a matching class). */
export function useCreateCompendiumSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<CompendiumSpell, 'id' | 'grade' | 'createdByUserId' | 'createdByName'> & { classLevels: Record<string, number> }) =>
      (await api.post<CompendiumSpell>('/compendium/spells', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compendium'] }),
  });
}

export function useDeleteCompendiumSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/compendium/spells/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compendium'] }),
  });
}

export function useAddFromCompendium(charId: number) {
  const qc = useQueryClient();
  const classId = useOpenSpellClass(charId);
  return useMutation({
    mutationFn: async (spellId: number) =>
      (await api.post(`/characters/${charId}/spells/from-compendium/${spellId}${bookQuery(classId)}`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spells', charId] }),
  });
}

// ---- Battle maps ----
/** GM: all maps; players: the active one. Refreshed live via the "map" notification. */
export const useMaps = () =>
  useQuery({ queryKey: ['maps'], queryFn: async () => (await api.get<BattleMap[]>('/maps')).data });

export function useCreateMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ url: string }>('/uploads/map', fd);
      // Read the local file (no CORS): size, and a grid painted into the image → take it over, don't draw our own.
      const local = URL.createObjectURL(file);
      const { w, h, grid } = await detectGrid(local).finally(() => URL.revokeObjectURL(local));
      const map = (await api.post<BattleMap>('/maps', {
        name: file.name.replace(/\.[^.]+$/, ''), imageUrl: data.url, imageWidth: w, imageHeight: h,
        ...(grid ? { gridSize: grid.size, gridOffsetX: grid.offsetX, gridOffsetY: grid.offsetY, showGrid: false } : {}),
      })).data;
      return { map, gridFound: !!grid };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  });
}

export function useSaveMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: BattleMap) => (await api.put<BattleMap>(`/maps/${m.id}`, m)).data,
    onSuccess: (m) => qc.setQueryData<BattleMap[]>(['maps'], (old) => old?.map((x) => (x.id === m.id ? m : x))),
  });
}

export function useMoveToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mapId, tokenId, x, y }: { mapId: number; tokenId: string; x: number; y: number }) =>
      (await api.post<BattleMap>(`/maps/${mapId}/tokens/${tokenId}/move`, { x, y })).data,
    onSuccess: (m) => qc.setQueryData<BattleMap[]>(['maps'], (old) => old?.map((x) => (x.id === m.id ? { ...x, tokens: m.tokens } : x))),
  });
}

export function useDuplicateMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post<BattleMap>(`/maps/${id}/duplicate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  });
}

/** GM asset library (furnishings, traps, levers …), shared by all GMs. */
export const useMapAssets = () =>
  useQuery({ queryKey: ['map-assets'], queryFn: async () => (await api.get<MapAsset[]>('/map-assets')).data });

export function useCreateMapAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<MapAsset, 'id' | 'createdByName'>) => (await api.post<MapAsset>('/map-assets', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map-assets'] }),
  });
}

export function useDeleteMapAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/map-assets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['map-assets'] }),
  });
}

export function useDeleteMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/maps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  });
}

// ---- Uploads ----
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ url: string }>('/uploads/image', fd);
      return data.url;
    },
  });
}

// ---- Messages ----
export const useMessages = (archived: boolean) =>
  useQuery({
    queryKey: ['messages', archived],
    queryFn: async () => (await api.get<Message[]>(`/messages?archived=${archived}`)).data,
    refetchInterval: 30_000, // surfaces scheduled messages near their time (no backend scheduler)
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: ['unread'],
    queryFn: async () => (await api.get<number>('/messages/unread-count')).data,
    refetchInterval: 30_000,
  });

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.post(`/messages/${id}/read`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['unread'] }); },
  });
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.post(`/messages/${id}/archive`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['messages'] }); qc.invalidateQueries({ queryKey: ['unread'] }); },
  });
}

export const useRecipients = () =>
  useQuery({
    queryKey: ['recipients'],
    queryFn: async () => (await api.get<{ userId: string; displayName: string; isGm: boolean }[]>('/messages/recipients')).data,
  });

export function useComposeMessage() {
  return useMutation({
    mutationFn: async (body: {
      subject: string; body: string; recipientUserIds: string[];
      toAll: boolean; isImportant: boolean; scheduledFor: string | null;
    }) => (await api.post('/messages', body)).data,
  });
}

// ---- Status effects ----
export const useStatus = (charId: number | null) =>
  useQuery({
    queryKey: ['status', charId],
    enabled: charId != null,
    queryFn: async () => (await api.get<StatusEffect[]>(`/characters/${charId}/status`)).data,
  });

export function useAddStatus(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StatusEffectInput) => (await api.post(`/characters/${charId}/status`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', charId] }),
  });
}

export function useDeleteStatus(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/characters/${charId}/status/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['status', charId] }),
  });
}

// ---- Notes ----
export const useNotes = () =>
  useQuery({ queryKey: ['notes'], queryFn: async () => (await api.get<Note[]>('/notes')).data });

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: NoteInput }) =>
      id
        ? (await api.put<Note>(`/notes/${id}`, input)).data
        : (await api.post<Note>('/notes', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

// ---- GM Level Up ----
export function useGrantLevelUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (characterId: number) =>
      (await api.post('/gm/levelup', { characterId })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['players'] }); qc.invalidateQueries({ queryKey: ['gm-characters'] }); },
  });
}

/** GM: take back a level (e.g. a level up given to the wrong character). */
export function useLevelDown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (characterId: number) => (await api.post('/gm/leveldown', { characterId })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['players'] }); qc.invalidateQueries({ queryKey: ['gm-characters'] }); },
  });
}

export function useAckLevelUp(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post(`/characters/${charId}/ack-levelup`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['character', charId] }),
  });
}

export function useUpdateHp(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (delta: number) =>
      (await api.patch<{ currentHp: number; tempHp: number }>(`/characters/${charId}/hp`, { delta })).data,
    onSuccess: (hp) => {
      qc.setQueryData<import('./types').Character>(['character', charId], (old) => (old ? { ...old, ...hp } : old));
    },
  });
}

/** Set temporary hit points (replaces the old value — temp HP don't stack). */
export function useSetTempHp(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) =>
      (await api.patch<{ currentHp: number; tempHp: number }>(`/characters/${charId}/temp-hp`, { value })).data,
    onSuccess: (hp) => {
      qc.setQueryData<import('./types').Character>(['character', charId], (old) => (old ? { ...old, ...hp } : old));
      qc.invalidateQueries({ queryKey: ['gm-characters'] });
    },
  });
}

/** Players can only spend gold (positive amount, always reduces) — granting more is a GM-only action. */
export function useSpendGold(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) =>
      (await api.patch<number>(`/characters/${charId}/gold`, { amount })).data,
    onSuccess: (newGold) => {
      qc.setQueryData<import('./types').Character>(['character', charId], (old) =>
        old ? { ...old, gold: newGold } : old,
      );
    },
  });
}

// ── Scheduling polls ──────────────────────────────────────────────────────────
export const usePolls = () =>
  useQuery({ queryKey: ['polls'], queryFn: async () => (await api.get<SchedulePoll[]>('/polls')).data });

function usePollMutation<T>(fn: (body: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['polls'] }) });
}
export const useCreatePoll = () =>
  usePollMutation((b: { title: string; description: string; options: string[] }) => api.post('/polls', b));
export const useVotePoll = () =>
  usePollMutation((b: { pollId: number; optionId: number; answer: PollAnswer | 'none' }) =>
    api.put(`/polls/${b.pollId}/vote`, { optionId: b.optionId, answer: b.answer }));
export const useChoosePoll = () =>
  usePollMutation((b: { pollId: number; optionId: number | null }) => api.post(`/polls/${b.pollId}/choose`, { optionId: b.optionId }));
export const useDeletePoll = () => usePollMutation((id: number) => api.delete(`/polls/${id}`));

// ── Group chat ────────────────────────────────────────────────────────────────
export const useChat = () =>
  useQuery({ queryKey: ['chat'], queryFn: async () => (await api.get<ChatMessage[]>('/chat')).data });

export function useSendChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => (await api.post<ChatMessage>('/chat', { text })).data,
    onSuccess: (m) => qc.setQueryData<ChatMessage[]>(['chat'], (old) =>
      old && !old.some((x) => x.id === m.id) ? [...old, m] : old),
  });
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const useCampaigns = (enabled = true) =>
  useQuery({ queryKey: ['campaigns'], enabled, queryFn: async () => (await api.get<CampaignSummary[]>('/campaigns')).data });

/** Campaign the API currently runs in (null = user has none). */
export const useCurrentCampaign = (enabled = true) =>
  useQuery({
    queryKey: ['campaign-current'], enabled,
    queryFn: async () => { const r = await api.get<CampaignDetail | ''>('/campaigns/current'); return r.data || null; },
  });

export const useRuleSystems = () =>
  useQuery({ queryKey: ['rule-systems'], staleTime: Infinity, queryFn: async () => (await api.get<RuleSystemInfo[]>('/rules/systems')).data });

function useCampaignMutation<T, R = unknown>(fn: (body: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => ['campaigns', 'campaign-current', 'campaign-invites'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}
export const useCreateCampaign = () =>
  useCampaignMutation(async (b: { name: string; description: string; ruleSystemId: string }) =>
    (await api.post<CampaignSummary>('/campaigns', b)).data);
export const useUpdateCampaign = () =>
  useCampaignMutation((b: { id: number; name: string; description: string; imageUrl: string | null; ruleSystemId: string }) =>
    api.put(`/campaigns/${b.id}`, b));
export const useDeleteCampaign = () => useCampaignMutation((id: number) => api.delete(`/campaigns/${id}`));
export const useLeaveCampaign = () => useCampaignMutation((id: number) => api.post(`/campaigns/${id}/leave`));
export const useRemoveMember = () =>
  useCampaignMutation((b: { id: number; userId: string }) => api.delete(`/campaigns/${b.id}/members/${b.userId}`));
export const useTransferGm = () =>
  useCampaignMutation((b: { id: number; userId: string }) => api.post(`/campaigns/${b.id}/transfer-gm`, { userId: b.userId }));

export const useInvites = (campaignId: number | null) =>
  useQuery({
    queryKey: ['campaign-invites', campaignId], enabled: campaignId != null,
    queryFn: async () => (await api.get<CampaignInvite[]>(`/campaigns/${campaignId}/invites`)).data,
  });
export const useCreateInvite = () =>
  useCampaignMutation(async (b: { id: number; expiresInDays: number | null; maxUses: number | null }) =>
    (await api.post<CampaignInvite>(`/campaigns/${b.id}/invites`, { expiresInDays: b.expiresInDays, maxUses: b.maxUses })).data);
export const useRevokeInvite = () =>
  useCampaignMutation((b: { id: number; inviteId: number }) => api.delete(`/campaigns/${b.id}/invites/${b.inviteId}`));

// ── Rule layout & live preview ────────────────────────────────────────────────
/** Layout + optional parts of the current campaign's rule system. Reset on campaign switch. */
// Keyed by campaign and refetched like any query: the cache is persisted, so a campaign switch that skips
// resetQueries (fallback in api.ts, a second tab), a deploy or a package update must not keep an old sheet.
export const useRuleLayout = () =>
  useQuery({
    queryKey: ['rule-layout', useCampaignStore((s) => s.campaignId)], staleTime: 1000 * 60 * 5,
    queryFn: async () => (await api.get<{ layout: RuleLayout; capabilities: string[] }>('/rules/layout')).data,
  });

/** Derived values for an unsaved form — computed by the server, the only place rules live. */
export const useCharacterPreview = (input: CharacterInput, id: number | null) =>
  useQuery({
    queryKey: ['character-preview', id, input],
    queryFn: async () => (await api.post<Derived>('/characters/preview', input, { params: id != null ? { id } : {} })).data,
    placeholderData: (prev) => prev,   // keep the last values while the next preview loads
    staleTime: 30_000,
  });

/** Attune to / release an item that needs attunement (limit per rule system). */
export function useAttune(charId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: { itemId: number; attuned: boolean }) =>
      (await api.patch<Character>(`/inventory/${charId}/items/${b.itemId}/attune`, { attuned: b.attuned })).data,
    onSuccess: (c) => {
      qc.setQueryData(['character', charId], c);
      for (const key of ['skillsheet', 'spellbook', 'spellslots']) qc.invalidateQueries({ queryKey: [key, charId] });
    },
  });
}
