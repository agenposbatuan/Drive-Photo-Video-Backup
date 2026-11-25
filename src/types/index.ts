export type AppSection =
  | 'beranda'
  | 'semua-foto'
  | 'album'
  | 'semua-video'
  | 'cadangkan'
  | 'family-gallery'
  | 'pengaturan';

export type ThemeMode = 'light' | 'dark' | 'system';

export type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

export type DuplicatePolicy = 'ask' | 'skip' | 'copy';

export type DuplicateResolution = 'skip' | 'copy' | 'cancel';

export type UploadTaskStatus =
  | 'queued'
  | 'checking_duplicate'
  | 'duplicate_pending'
  | 'uploading'
  | 'paused'
  | 'interrupted'
  | 'waiting_auth'
  | 'needs_file'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface AuthUserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
}

export interface AuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  hasValidToken: boolean;
  tokenExpired: boolean;
  user: AuthUserProfile | null;
  error: string | null;
}

export interface DriveImageMetadata {
  width?: number;
  height?: number;
  time?: string;
  cameraMake?: string;
  cameraModel?: string;
  exposureTime?: number;
  aperture?: number;
  isoSpeed?: number;
  focalLength?: number;
}

export interface DriveVideoMetadata {
  width?: number;
  height?: number;
  durationMillis?: string;
}

export interface DriveCapabilities {
  canAddChildren?: boolean;
  canListChildren?: boolean;
  canEdit?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
  md5Checksum?: string;
  imageMediaMetadata?: DriveImageMetadata;
  videoMediaMetadata?: DriveVideoMetadata;
  capabilities?: DriveCapabilities;
  appProperties?: Record<string, string>;
}

export interface PhotoItem extends DriveFile {
  sizeBytes: number;
  folderId: string;
  folderName?: string;
  displayDate: string;
}

export interface VideoItem extends DriveFile {
  sizeBytes: number;
  folderId: string;
  folderName?: string;
  displayDate: string;
  durationMillis?: number;
}

export interface AlbumSummary {
  id: string;
  name: string;
  parentId: string | null;
  photoCount: number;
  subfolderCount: number;
  coverPhotoId?: string;
  coverThumbnailLink?: string;
  modifiedTime?: string;
  canAddChildren: boolean;
}

export interface FolderBreadcrumb {
  id: string;
  name: string;
}

export interface RecentAlbumRef {
  id: string;
  name: string;
  accessedAt: number;
  photoCount?: number;
  coverThumbnailLink?: string;
}

export interface RootFolderConfig {
  id: string;
  name: string;
  verifiedAt: number;
  canAddChildren: boolean;
}

export interface AppSettings {
  theme: ThemeMode;
  rootFolder: RootFolderConfig | null;
  maxConcurrentUploads: number;
  defaultDuplicatePolicy: DuplicatePolicy;
  notificationsEnabled: boolean;
  recentAlbums: RecentAlbumRef[];
  galleryQuality: PhotoQualityMode;
}

export interface DuplicateMatch {
  existingFile: DriveFile;
  confidence: 'exact_hash' | 'name_and_size' | 'name_only';
  reason: string;
}

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  destinationFolderId: string;
  destinationFolderName: string;
  relativeFolderPath: string;
  resolvedFolderId?: string;
  status: UploadTaskStatus;
  progress: number;
  bytesUploaded: number;
  retryCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  resumableSessionUri: string | null;
  sessionCreatedAt?: number;
  contentHash?: string;
  hasPersistedBlob: boolean;
  uploadedDriveFileId?: string;
  verifiedIntegrity?: boolean;
  duplicateMatch?: DuplicateMatch;
}

export interface BackupActivity {
  id: string;
  fileName: string;
  fileSize: number;
  destinationFolderName: string;
  relativeFolderPath: string;
  status: 'completed' | 'failed' | 'skipped';
  timestamp: number;
  driveFileId?: string;
  errorMessage?: string;
}

export interface StorageQuotaInfo {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  availableBytes: number;
}

export type StorageStatusLevel = 'normal' | 'warning' | 'critical' | 'full';

export interface DriveStorageQuota {
  limit?: number;
  usage: number;
  usageInDrive?: number;
  usageInDriveTrash?: number;
  available?: number;
  percentUsed: number;
  status: StorageStatusLevel;
  usageFormattedGB: string;
  limitFormattedGB: string;
  availableFormattedGB: string;
  percentFormatted: string;
  user?: {
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  };
  lastFetchedAt: number;
}

export interface DriveStats {
  totalPhotos: number;
  totalAlbums: number;
  lastSyncedAt: number | null;
  isPartial: boolean;
}

export type GalleryContentMode = 'all_albums' | 'selected_albums' | 'custom_photos' | 'mixed';
export type PhotoQualityMode = 'data_saver' | 'hd' | 'auto' | 'original';
export type GalleryStatus = 'active' | 'expired' | 'revoked';

export interface GalleryAlbumPermission {
  folderId: string;
  folderName: string;
  allowDownload: boolean;
}

export interface GalleryPhotoPermission {
  fileId: string;
  parentFolderId: string;
  fileName: string;
  allowDownload: boolean;
}

export interface GalleryAccessLog {
  id: string;
  eventType: string;
  viewerIdentifier: string;
  targetId: string | null;
  createdAt: string;
}

export interface FamilyGalleryItem {
  id: string;
  name: string;
  contentMode: GalleryContentMode;
  defaultQuality: PhotoQualityMode;
  allowDownloadDefault: boolean;
  status: GalleryStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean;
  displayPassword?: string;
  hasActiveLink: boolean;
  albums: GalleryAlbumPermission[];
  photos: GalleryPhotoPermission[];
  recentLogs: GalleryAccessLog[];
}

export interface FamilyViewerPhoto {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string;
  folderName: string;
  displayDate: string;
  width?: number;
  height?: number;
  allowDownload: boolean;
}

export interface FamilyViewerAlbum {
  id: string;
  name: string;
  allowDownload: boolean;
  photoCount: number;
}

export interface FolderTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  photoCount: number;
  subfolderCount: number;
  children: FolderTreeNode[];
  isExpanded?: boolean;
}

