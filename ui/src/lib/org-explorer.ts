/**
 * Pure helpers for the agent org explorer (team-focused hierarchy view).
 *
 * The explorer replaces a single zoom-to-fit canvas — unreadable once a
 * manager has dozens of reports — with two coordinated views over the same
 * index: a collapsible hierarchy list for orientation and search, and a focus
 * panel showing one agent, its chain of command and its direct reports.
 */

export interface OrgTreeNode {
  id: string;
  name: string;
  role: string;
  status: string;
  reports: OrgTreeNode[];
}

export interface OrgIndexEntry {
  node: OrgTreeNode;
  parentId: string | null;
  depth: number;
  /** All agents below this one (not counting itself). */
  descendantCount: number;
}

export interface OrgIndex {
  roots: OrgTreeNode[];
  byId: Map<string, OrgIndexEntry>;
  /** Pre-order, siblings sorted by name. */
  order: string[];
}

export interface OrgSearchFields {
  title?: string | null;
  role?: string | null;
}

function byName(a: OrgTreeNode, b: OrgTreeNode) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function indexOrgTree(roots: OrgTreeNode[]): OrgIndex {
  const byId = new Map<string, OrgIndexEntry>();
  const order: string[] = [];
  const sortedRoots = [...roots].sort(byName);

  function visit(node: OrgTreeNode, parentId: string | null, depth: number, seen: Set<string>): number {
    // Defensive: a corrupted reportsTo cycle must not hang the page.
    if (seen.has(node.id) || byId.has(node.id)) return 0;
    seen.add(node.id);
    const entry: OrgIndexEntry = { node, parentId, depth, descendantCount: 0 };
    byId.set(node.id, entry);
    order.push(node.id);
    let count = 0;
    for (const child of [...node.reports].sort(byName)) {
      if (byId.has(child.id)) continue;
      count += 1 + visit(child, node.id, depth + 1, seen);
    }
    entry.descendantCount = count;
    return count;
  }

  for (const root of sortedRoots) visit(root, null, 0, new Set());
  return { roots: sortedRoots, byId, order };
}

/** Root → … → agent, inclusive. Empty when the agent is unknown. */
export function orgPath(index: OrgIndex, id: string): OrgIndexEntry[] {
  const path: OrgIndexEntry[] = [];
  let current = index.byId.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.node.id)) {
    guard.add(current.node.id);
    path.unshift(current);
    current = current.parentId ? index.byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Direct reports of an agent (or the roots when id is null), sorted by name. */
export function directReports(index: OrgIndex, id: string | null): OrgTreeNode[] {
  if (id === null) return index.roots;
  const entry = index.byId.get(id);
  if (!entry) return [];
  return [...entry.node.reports].filter((child) => index.byId.has(child.id)).sort(byName);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Agents whose name, title or role contains every whitespace-separated term
 * (case- and accent-insensitive), in hierarchy order.
 */
export function searchOrg(
  index: OrgIndex,
  query: string,
  fields: (id: string) => OrgSearchFields = () => ({}),
): string[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return index.order.filter((id) => {
    const entry = index.byId.get(id)!;
    const extra = fields(id);
    const haystack = normalize([entry.node.name, entry.node.role, extra.title ?? "", extra.role ?? ""].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

/** Ancestors of every given agent (excluding the agents themselves). */
export function ancestorIds(index: OrgIndex, ids: Iterable<string>): Set<string> {
  const result = new Set<string>();
  for (const id of ids) {
    let parentId = index.byId.get(id)?.parentId ?? null;
    while (parentId && !result.has(parentId)) {
      result.add(parentId);
      parentId = index.byId.get(parentId)?.parentId ?? null;
    }
  }
  return result;
}

/**
 * Initial expansion: roots and the first management level are open, so the
 * first screen shows the leadership structure without listing every agent.
 */
export function defaultExpandedIds(index: OrgIndex, maxDepth = 1): Set<string> {
  const expanded = new Set<string>();
  for (const id of index.order) {
    const entry = index.byId.get(id)!;
    if (entry.depth < maxDepth && entry.node.reports.length > 0) expanded.add(id);
  }
  return expanded;
}

export interface OrgTreeRow {
  id: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  descendantCount: number;
  /** True when the row is shown only as the path to a search match. */
  contextOnly: boolean;
}

/**
 * Flattened, visible rows for the hierarchy list. With an active search only
 * matches and their ancestors are listed (ancestors forced open).
 */
export function visibleOrgRows(
  index: OrgIndex,
  expanded: ReadonlySet<string>,
  matches: readonly string[] | null = null,
): OrgTreeRow[] {
  const matchSet = matches ? new Set(matches) : null;
  const pathSet = matches ? ancestorIds(index, matches) : null;
  const rows: OrgTreeRow[] = [];

  function walk(node: OrgTreeNode) {
    const entry = index.byId.get(node.id);
    if (!entry || entry.node !== node) return;
    const inSearch = !matchSet || matchSet.has(node.id) || pathSet!.has(node.id);
    if (!inSearch) return;
    const children = directReports(index, node.id);
    const isOpen = matchSet ? pathSet!.has(node.id) || expanded.has(node.id) : expanded.has(node.id);
    rows.push({
      id: node.id,
      depth: entry.depth,
      hasChildren: children.length > 0,
      expanded: isOpen && children.length > 0,
      descendantCount: entry.descendantCount,
      contextOnly: Boolean(matchSet && !matchSet.has(node.id)),
    });
    if (isOpen) children.forEach(walk);
  }

  index.roots.forEach(walk);
  return rows;
}

export interface OrgStatusSummary {
  total: number;
  byStatus: Record<string, number>;
}

/** Status counts for an agent's whole team (the agent plus everyone below). */
export function teamStatusSummary(index: OrgIndex, id: string): OrgStatusSummary {
  const byStatus: Record<string, number> = {};
  let total = 0;
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const entry = index.byId.get(current);
    if (!entry) continue;
    total += 1;
    byStatus[entry.node.status] = (byStatus[entry.node.status] ?? 0) + 1;
    for (const child of entry.node.reports) stack.push(child.id);
  }
  return { total, byStatus };
}
