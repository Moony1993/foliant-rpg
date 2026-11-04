import { useMemo, useState } from 'react';
import { BRANCHES, buildGraph, featConfig, featKey, isCore, layoutBranch, type BranchId, type TreeNode } from '../lib/featTree';
import { useRuleLayout } from '../lib/queries';
import type { Feat } from '../lib/types';
import { Flourish } from '../pages/Spells';
import '../pages/spellbook.css';
import melee from '../assets/feats/branch-melee.png';
import ranged from '../assets/feats/branch-ranged.png';
import maneuver from '../assets/feats/branch-maneuver.png';
import defense from '../assets/feats/branch-defense.png';
import magic from '../assets/feats/branch-magic.png';
import general from '../assets/feats/branch-general.png';
import { t } from '../lib/i18n';

export type FeatGate = 'ok' | 'locked' | 'never';
const EMBLEM: Record<BranchId, string> = { melee, ranged, maneuver, defense, magic, general };
const ROW = 96, SEAL_TOP = 6, SEAL = 46;

const initials = (name: string) => {
  const m = name.match(/^(.+?), (Improved|Greater|Great|Lesser|Minor)$/);
  return (m ? `${m[2]} ${m[1]}` : name).split(/[\s-]+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 3);
};

/**
 * Talent tree over the Core Rulebook feats (the rest stays in the list view). Feats the character can never take (other class /
 * race) are hidden unless already learned; the rest show as learned / learnable / locked. `status` = can it be learned
 * now ('ok'), not yet ('locked') or never ('never'); granted feats come from the class and can't be forgotten.
 */
export function FeatTree({ feats, selectedIds, grantedIds, status, whyNot, summary, warning, busy, onLearn, onForget }: {
  feats: Feat[]; selectedIds: number[]; grantedIds: number[]; status: (f: Feat) => FeatGate; whyNot: (f: Feat) => string;
  summary: string; warning?: string; busy: boolean; onLearn: (f: Feat) => void; onForget: (f: Feat) => void;
}) {
  const cfg = featConfig(useRuleLayout().data?.layout);
  const graph = useMemo(() => buildGraph(feats.filter((f) => isCore(f, cfg)), cfg), [feats, cfg]);
  const keyOf = (ids: number[]) => new Set(feats.filter((f) => ids.includes(f.id)).map((f) => featKey(f.name)));
  const granted = keyOf(grantedIds);
  const taken = new Set([...keyOf(selectedIds), ...granted]);
  // Chosen feats that aren't in the tree (not Core Rulebook) — the tree view has no other list.
  const outside = feats.filter((f) => selectedIds.includes(f.id) && !isCore(f, cfg));
  const visible = (k: string) => taken.has(k) || status(graph.byKey.get(k)!) !== 'never';
  const trees = BRANCHES.map((b) => ({ ...b, tree: layoutBranch(graph, b.id, visible) })).filter((b) => b.tree.nodes.some((n) => !n.ghost));
  const [branch, setBranch] = useState<BranchId>('melee');
  const [open, setOpen] = useState<TreeNode | null>(null);
  const cur = trees.find((b) => b.id === branch) ?? trees[0];

  const state = (n: TreeNode) => taken.has(n.key) ? 'on' : n.ghost ? 'ghost' : status(n.feat) === 'ok' ? 'av' : 'lock';
  if (!cur) return <p className="sb-hint">{t('Keine Talente im Kompendium.')}</p>;
  const chains = cur.tree.nodes.filter((n) => cur.tree.soloRow === null || n.row < cur.tree.soloRow);
  const solos = cur.tree.nodes.filter((n) => cur.tree.soloRow !== null && n.row >= cur.tree.soloRow);
  const chainRows = cur.tree.soloRow ?? cur.tree.rows;

  const node = (n: TreeNode, rowOffset: number) => {
    const s = state(n);
    return (
      <button key={n.key} className={`ft-node ${s}`} style={{ gridRow: n.row - rowOffset + 1, gridColumn: n.col + 1 }}
        onClick={() => setOpen(n)} aria-label={n.feat.name}>
        <span className="ft-seal">{initials(n.feat.name)}</span>
        {!n.ghost && <span className="ft-pts">{granted.has(n.key) ? t('Kl.') : s === 'on' ? '1/1' : '0/1'}</span>}
        <span className="ft-name">{n.feat.name}</span>
      </button>
    );
  };

  // Right-angled links: down from the prerequisite, across in the gap above the feat, down into it.
  const at = new Map(chains.map((n) => [n.key, n]));
  const links = chains.flatMap((n) => n.deps.map((d) => at.get(d)).filter((p): p is TreeNode => !!p).map((p) => {
    const x1 = (p.col + 0.5) * 100, y1 = p.row * ROW + SEAL_TOP + SEAL;
    // The horizontal run sits a little higher per source column, so links from different feats don't merge.
    const x2 = (n.col + 0.5) * 100, y2 = n.row * ROW + SEAL_TOP, ym = y2 - 4 - p.col * 5;
    return { id: `${p.key}>${n.key}`, lit: taken.has(p.key), d: `M${x1},${y1} V${ym} H${x2} V${y2}` };
  }));
  const openBranch = open && BRANCHES.find((b) => b.id === graph.branch.get(open.key));

  return (
    <div className="sb">
      <div className="sb-book">
        <div className="sb-page" style={{ height: 'auto', minHeight: 300, paddingBottom: 24 }}>
          <div className="sb-ribbons">
            {trees.map((b) => (
              <button key={b.id} className={`sb-ribbon ${b.id === 'magic' ? 'sb-ribbon--violet' : b.id === 'general' ? 'sb-ribbon--blue' : ''}`}
                aria-current={b.id === cur.id} onClick={() => setBranch(b.id)}>{b.label}</button>
            ))}
          </div>
          <img className="ft-emblem" src={EMBLEM[cur.id]} alt="" />
          <div className="sb-kapitel">{t('Talentbaum')}</div>
          <div className="sb-title">{cur.label}</div>
          <Flourish />
          <p className="sb-hint" style={{ marginTop: 0 }}>
            {summary}
          </p>
          {warning && <p className="sb-hint" style={{ color: 'var(--rubric)' }}>{warning}</p>}
          {outside.length > 0 && (
            <p className="sb-hint" style={{ marginTop: 2 }}>{t('Außerdem gewählt (Liste): {v}', { v: outside.map((f) => f.name).join(', ') })}</p>
          )}
          {chains.length > 0 && (
            <div className="ft-grid" style={{ gridTemplateRows: `repeat(${chainRows}, ${ROW}px)`, marginTop: 8 }}>
              <svg className="ft-lines" viewBox={`0 0 400 ${chainRows * ROW}`} preserveAspectRatio="none" aria-hidden>
                {links.map((l) => (
                  <path key={l.id} d={l.d} fill="none" vectorEffect="non-scaling-stroke"
                    stroke={l.lit ? '#a87a1f' : 'rgba(74,50,32,.45)'} strokeWidth={l.lit ? 3 : 1.5} strokeDasharray={l.lit ? undefined : '4 3'} />
                ))}
              </svg>
              {chains.map((n) => node(n, 0))}
            </div>
          )}
          {solos.length > 0 && (
            <>
              <div className="sb-sub">{t('Einzelne Talente')}</div>
              <div className="ft-grid">{solos.map((n) => node(n, chainRows))}</div>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="sb-sheet-bg" onClick={() => setOpen(null)}>
          <div role="dialog" className="sb-sheet sb-page" onClick={(e) => e.stopPropagation()}>
            <div className="sb-kapitel">{openBranch?.label} · {open.feat.type}</div>
            <div className="sb-title">{open.feat.name}</div>
            {open.feat.prerequisites && open.feat.prerequisites !== '—' && (
              <div className="sb-stat"><b>{t('Voraussetzung')}</b><span>{open.feat.prerequisites}</span></div>
            )}
            <p className="sb-desc" style={{ marginTop: 10 }}>{open.feat.benefit}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {open.ghost ? (
                <button className="sb-btn sb-btn--line" onClick={() => { setBranch(graph.branch.get(open.key)!); setOpen(null); }}> {t('Zum Zweig {label}', { label: openBranch?.label })} </button>
              ) : granted.has(open.key) ? null : taken.has(open.key) ? (
                <>
                  <button className="sb-btn sb-btn--line" disabled={busy} onClick={() => { onForget(open.feat); setOpen(null); }}>{t('Vergessen')}</button>
                  {/* Feats with a choice (Weapon Focus for another weapon) or "Extra …" feats can be taken again. */}
                  {status(open.feat) === 'ok' && (
                    <button className="sb-btn sb-btn--gold" disabled={busy} onClick={() => { onLearn(open.feat); setOpen(null); }}>{t('✒ Erneut lernen')}</button>
                  )}
                </>
              ) : (
                <button className="sb-btn sb-btn--gold" disabled={busy || status(open.feat) !== 'ok'}
                  onClick={() => { onLearn(open.feat); setOpen(null); }}>{t('✒ Lernen')}</button>
              )}
              <button className="sb-btn sb-btn--line" onClick={() => setOpen(null)}>{t('Schließen')}</button>
            </div>
            {granted.has(open.key) && <p className="sb-hint">{t('Durch deine Klasse erhalten.')}</p>}
            {!open.ghost && !taken.has(open.key) && status(open.feat) !== 'ok' && <p className="sb-hint">{whyNot(open.feat)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
