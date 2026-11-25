import { FolderTreeNode, GalleryAlbumPermission } from '../src/types';
import { FolderService } from '../src/services/FolderService';

console.log('--- TEST: RECURSIVE NESTED FOLDER SELECTION & TREE LOGIC ---');

// Mock nested tree hierarchy with deep nesting and empty folders:
// Root
//  ├── Liburan 2024 (depth 0, 10 photos, 2 subfolders)
//  │    ├── Bali (depth 1, 5 photos, 1 subfolder)
//  │    │    └── Pantai Pandawa (depth 2, 8 photos, 0 subfolders)
//  │    └── Lombok (depth 1, 0 photos, 1 subfolder) [EMPTY PHOTOS FOLDER WITH SUBFOLDER]
//  │         └── Gili Trawangan (depth 2, 0 photos, 1 subfolder)
//  │              └── Level 4 Hidden Cove (depth 3, 0 photos, 0 subfolders) [COMPLETELY EMPTY FOLDER]
//  └── Dokumen Arsip (depth 0, 0 photos, 0 subfolders) [COMPLETELY EMPTY FOLDER AT ROOT]

const mockTree: FolderTreeNode[] = [
  {
    id: 'folder-liburan',
    name: 'Liburan 2024',
    parentId: 'root',
    depth: 0,
    photoCount: 10,
    subfolderCount: 2,
    children: [
      {
        id: 'folder-bali',
        name: 'Bali',
        parentId: 'folder-liburan',
        depth: 1,
        photoCount: 5,
        subfolderCount: 1,
        children: [
          {
            id: 'folder-pandawa',
            name: 'Pantai Pandawa',
            parentId: 'folder-bali',
            depth: 2,
            photoCount: 8,
            subfolderCount: 0,
            children: [],
          },
        ],
      },
      {
        id: 'folder-lombok',
        name: 'Lombok',
        parentId: 'folder-liburan',
        depth: 1,
        photoCount: 0,
        subfolderCount: 1,
        children: [
          {
            id: 'folder-gili',
            name: 'Gili Trawangan',
            parentId: 'folder-lombok',
            depth: 2,
            photoCount: 0,
            subfolderCount: 1,
            children: [
              {
                id: 'folder-level-4',
                name: 'Level 4 Hidden Cove',
                parentId: 'folder-gili',
                depth: 3,
                photoCount: 0,
                subfolderCount: 0,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'folder-arsip-kosong',
    name: 'Dokumen Arsip',
    parentId: 'root',
    depth: 0,
    photoCount: 0,
    subfolderCount: 0,
    children: [],
  },
];

// Test 1: Flatten tree
const flat = FolderService.flattenFolderTree(mockTree);
console.log(`[Test 1] Flattening tree... Discovered ${flat.length} total folders.`);
if (flat.length !== 7) {
  throw new Error(`Expected 7 folders, got ${flat.length}`);
}
console.log('✓ Flatten folder tree returned all nested nodes without truncation.');

// Test 2: Descendant collection for cascade selection
const liburanDescendants = FolderService.getAllDescendantIds(mockTree[0]);
console.log(`[Test 2] Collecting descendants of Liburan 2024... Discovered ${liburanDescendants.size} IDs.`);
if (liburanDescendants.size !== 6) {
  throw new Error(`Expected 6 descendants for Liburan 2024, got ${liburanDescendants.size}`);
}
if (!liburanDescendants.has('folder-level-4')) {
  throw new Error('Level 4 deep folder missing from descendants set!');
}
console.log('✓ Cascade descendant collection traverses all arbitrary depth levels.');

// Test 3: Empty folder inclusion
const emptyFolders = flat.filter((f) => f.photoCount === 0);
console.log(`[Test 3] Verifying empty folders in hierarchy... Found ${emptyFolders.length} empty folders.`);
if (emptyFolders.length !== 4) {
  throw new Error(`Expected 4 empty folders, got ${emptyFolders.length}`);
}
console.log('✓ Empty folders (0 photos) are fully preserved and selectable.');

// Test 4: Find node by ID
const foundNode = FolderService.findNodeInTree(mockTree, 'folder-level-4');
if (!foundNode || foundNode.name !== 'Level 4 Hidden Cove') {
  throw new Error('Failed to find deep node in tree by ID');
}
console.log(`✓ Node lookup succeeded: found "${foundNode.name}" at depth ${foundNode.depth}.`);

// Test 5: Verify permissions mapping for selected deep folders
const selectedFolderIds = new Set(['folder-level-4', 'folder-arsip-kosong']);
const folderMap = new Map(flat.map((f) => [f.id, f.name]));
const perms: GalleryAlbumPermission[] = Array.from(selectedFolderIds).map((id) => ({
  folderId: id,
  folderName: folderMap.get(id) || 'Folder',
  allowDownload: true,
}));

if (perms.length !== 2) {
  throw new Error('Permissions mapping failed');
}
if (!perms.some((p) => p.folderId === 'folder-level-4' && p.folderName === 'Level 4 Hidden Cove')) {
  throw new Error('Deep subfolder permission missing correct ID/Name mapping');
}
console.log('✓ GalleryAlbumPermission mapping retains actual folder IDs and names at all depths.');

console.log('--- ALL RECURSIVE FOLDER SELECTION TESTS PASSED (100%) ---');
