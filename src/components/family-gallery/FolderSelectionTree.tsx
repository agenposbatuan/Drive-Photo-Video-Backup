import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderCheck,
  FolderOpen,
  Search,
  X,
  Layers,
} from 'lucide-react';
import { FolderTreeNode } from '../../types';
import { FolderService } from '../../services/FolderService';

export interface FolderSelectionTreeProps {
  tree: FolderTreeNode[];
  selectedFolderIds: Set<string>;
  onToggleFolder: (id: string) => void;
  onSelectSubtree?: (node: FolderTreeNode, selected: boolean) => void;
  onSelectAll?: () => void;
  onClearAll?: () => void;
  loading?: boolean;
}

export const FolderSelectionTree: React.FC<FolderSelectionTreeProps> = ({
  tree,
  selectedFolderIds,
  onToggleFolder,
  onSelectSubtree,
  onSelectAll,
  onClearAll,
  loading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Default: expand top level folders
    const initial = new Set<string>();
    for (const node of tree) {
      initial.add(node.id);
    }
    return initial;
  });

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    const collect = (nodes: FolderTreeNode[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          all.add(n.id);
          collect(n.children);
        }
      }
    };
    collect(tree);
    setExpandedIds(all);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  // Helper filter node tree with search query while preserving ancestor chains
  const filteredTree = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tree;

    const filterNodes = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
      const result: FolderTreeNode[] = [];
      for (const node of nodes) {
        const nameMatches = node.name.toLowerCase().includes(q);
        const filteredChildren = filterNodes(node.children);

        if (nameMatches || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return result;
    };

    return filterNodes(tree);
  }, [tree, searchQuery]);

  // If searching, auto-expand nodes so matching items are visible
  const effectiveExpandedIds = useMemo(() => {
    if (!searchQuery.trim()) return expandedIds;
    const all = new Set<string>(expandedIds);
    const expandMatching = (nodes: FolderTreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          all.add(n.id);
          expandMatching(n.children);
        }
      }
    };
    expandMatching(filteredTree);
    return all;
  }, [searchQuery, expandedIds, filteredTree]);

  // Hitung total flat nodes di seluruh pohon
  const allNodesFlat = useMemo(() => FolderService.flattenFolderTree(tree), [tree]);

  const handleCascadeClick = (node: FolderTreeNode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSelectSubtree) return;
    const descendantIds = FolderService.getAllDescendantIds(node);
    // Jika semua sudah terpilih, hapus seleksi subtree; jika belum, pilih semua
    let allSelected = true;
    for (const id of descendantIds) {
      if (!selectedFolderIds.has(id)) {
        allSelected = false;
        break;
      }
    }
    onSelectSubtree(node, !allSelected);
  };

  const renderNode = (node: FolderTreeNode) => {
    const isExpanded = effectiveExpandedIds.has(node.id);
    const isChecked = selectedFolderIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isEmpty = node.photoCount === 0 && (!hasChildren || node.subfolderCount === 0);

    // Hitung status seleksi subfolder
    let someDescendantsChecked = false;
    let allDescendantsChecked = true;
    if (hasChildren) {
      const descendantIds = FolderService.getAllDescendantIds(node);
      let count = 0;
      for (const id of descendantIds) {
        if (selectedFolderIds.has(id)) count++;
      }
      someDescendantsChecked = count > 0 && count < descendantIds.size;
      allDescendantsChecked = count === descendantIds.size;
    }

    return (
      <div key={node.id} className="relative select-none">
        {/* Node row */}
        <div
          className={`group flex items-center gap-1.5 py-1 px-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
            isChecked
              ? 'bg-blue-50/90 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-medium'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: `${Math.max(4, node.depth * 18 + 4)}px` }}
          onClick={() => onToggleFolder(node.id)}
        >
          {/* Tree guide line for nested nodes */}
          {node.depth > 0 && (
            <div
              className="absolute border-l border-slate-200 dark:border-slate-700 pointer-events-none"
              style={{
                left: `${node.depth * 18 - 8}px`,
                top: 0,
                bottom: 0,
                width: '1px',
              }}
            />
          )}

          {/* Expand / collapse chevron */}
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 transition-colors"
              title={isExpanded ? 'Tutup subfolder' : 'Buka subfolder'}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 h-4 shrink-0" />
          )}

          {/* Checkbox */}
          <div
            className="shrink-0 flex items-center justify-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFolder(node.id);
            }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleFolder(node.id)}
              className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
          </div>

          {/* Folder Icon */}
          <div className="shrink-0">
            {hasChildren && isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : hasChildren ? (
              <Folder className="h-4 w-4 text-blue-500" />
            ) : isEmpty ? (
              <Folder className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            ) : (
              <FolderCheck className="h-4 w-4 text-emerald-500" />
            )}
          </div>

          {/* Folder Name & Badges */}
          <span className="truncate flex-1 font-sans" title={node.name}>
            {node.name}
          </span>

          {/* Metadata Badges */}
          <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
            {node.photoCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
                {node.photoCount} foto
              </span>
            ) : (
              <span
                className="px-1.5 py-0.2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40"
                title="Folder ini kosong atau belum memiliki foto"
              >
                0 foto
              </span>
            )}

            {hasChildren && (
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                ({node.subfolderCount} sub)
              </span>
            )}

            {/* Quick cascade selection button for parent folders */}
            {hasChildren && onSelectSubtree && (
              <button
                type="button"
                onClick={(e) => handleCascadeClick(node, e)}
                className={`opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-opacity flex items-center gap-1 ${
                  allDescendantsChecked
                    ? 'border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={allDescendantsChecked ? 'Batal pilih semua subfolder' : 'Pilih folder ini beserta semua subfolder'}
              >
                <Layers className="h-2.5 w-2.5" />
                <span>{allDescendantsChecked ? 'Batal Sub' : '+ Semua Sub'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Nested Children */}
        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Search & Tree Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari folder atau subfolder..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-8 pr-8 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Tree controls */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 text-[11px] shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-2 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium transition-colors"
            >
              Buka Semua
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-2 py-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium transition-colors"
            >
              Tutup Semua
            </button>
          </div>

          {(onSelectAll || onClearAll) && (
            <div className="flex items-center gap-1">
              <span className="text-slate-300 dark:text-slate-700">|</span>
              {onSelectAll && (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium transition-colors"
                >
                  Pilih Semua
                </button>
              )}
              {onClearAll && selectedFolderIds.size > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950 text-red-500 font-medium transition-colors"
                >
                  Hapus ({selectedFolderIds.size})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tree View Container */}
      <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 p-1.5 space-y-0.5">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Memindai seluruh hierarki folder Google Drive...
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 italic">
            {searchQuery
              ? `Tidak ada folder yang cocok dengan "${searchQuery}".`
              : 'Tidak ada folder atau subfolder ditemukan di bawah root.'}
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node))
        )}
      </div>

      {/* Summary footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
        <span>
          Terpilih: <strong className="text-blue-600 dark:text-blue-400">{selectedFolderIds.size}</strong> dari{' '}
          {allNodesFlat.length} folder
        </span>
        <span className="italic text-[10px]">
          Folder kosong (0 foto) tetap dapat dibagikan
        </span>
      </div>
    </div>
  );
};
