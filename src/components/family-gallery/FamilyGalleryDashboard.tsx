import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderHeart,
  Images,
  Key,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldOff,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  DriveFile,
  FamilyGalleryItem,
  FolderTreeNode,
  GalleryAlbumPermission,
  GalleryContentMode,
  GalleryPhotoPermission,
  GalleryStatus,
  PhotoItem,
  PhotoQualityMode,
} from '../../types';
import { FamilyGalleryService } from '../../services/FamilyGalleryService';
import { FolderService } from '../../services/FolderService';
import { PhotoService } from '../../services/PhotoService';
import { PendingShareService } from '../../services/PendingShareService';
import { QualitySelector } from './QualitySelector';
import { FolderSelectionTree } from './FolderSelectionTree';

const EXPIRY_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: '1 jam', value: '1h' },
  { label: '24 jam', value: '24h' },
  { label: '3 hari', value: '3d' },
  { label: '7 hari', value: '7d' },
  { label: '14 hari', value: '14d' },
  { label: '30 hari', value: '30d' },
  { label: '90 hari', value: '90d' },
  { label: '1 tahun', value: '365d' },
  { label: 'Tanpa batas', value: null },
];

function computeExpiresAt(preset: string | null): string | null {
  if (!preset) return null;
  const match = preset.match(/^(\d+)([hd])$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const ms = unit === 'h' ? amount * 3600_000 : amount * 86400_000;
  return new Date(Date.now() + ms).toISOString();
}

function statusBadge(status: GalleryStatus) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 text-[10px] font-bold">
          <CheckCircle2 className="h-3 w-3" /> Tautan Aktif
        </span>
      );
    case 'expired':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
          <Clock className="h-3 w-3" /> Kedaluwarsa
        </span>
      );
    case 'revoked':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">
          <ShieldOff className="h-3 w-3" /> Dinonaktifkan / Dicabut
        </span>
      );
  }
}

interface SuccessModalData {
  name: string;
  shareUrl: string;
  password: string;
  expiresAt: string | null;
  allowDownload: boolean;
  quality: PhotoQualityMode;
}

interface FamilyGalleryDashboardProps {
  rootFolderId?: string | null;
  rootFolderName?: string | null;
  hasValidToken: boolean;
}

export const FamilyGalleryDashboard: React.FC<FamilyGalleryDashboardProps> = ({
  rootFolderId,
  rootFolderName,
  hasValidToken,
}) => {
  const [galleries, setGalleries] = useState<FamilyGalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Success dialog state after creation
  const [successData, setSuccessData] = useState<SuccessModalData | null>(null);

  // Modals for password change & expiration extension
  const [changePasswordTarget, setChangePasswordTarget] = useState<FamilyGalleryItem | null>(null);
  const [extendExpiryTarget, setExtendExpiryTarget] = useState<FamilyGalleryItem | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadGalleries = useCallback(async () => {
    if (!hasValidToken) return;
    setLoading(true);
    setError(null);
    try {
      await FamilyGalleryService.syncOwnerSession(
        rootFolderId && rootFolderName ? { id: rootFolderId, name: rootFolderName } : null
      );
      const list = await FamilyGalleryService.listGalleries();
      setGalleries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar galeri keluarga.');
    } finally {
      setLoading(false);
    }
  }, [hasValidToken, rootFolderId, rootFolderName]);

  useEffect(() => {
    void loadGalleries();
  }, [loadGalleries]);

  const handleCopyLink = async (gallery: FamilyGalleryItem) => {
    setActionLoading(`link_${gallery.id}`);
    try {
      const { shareToken } = await FamilyGalleryService.regenerateLink(gallery.id);
      const url = FamilyGalleryService.getShareUrl(shareToken);
      await navigator.clipboard.writeText(url);
      showToast('Tautan privat berhasil disalin ke clipboard!');
      await loadGalleries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyalin tautan galeri.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyPassword = async (pw?: string) => {
    if (!pw) return;
    await navigator.clipboard.writeText(pw);
    showToast('Password galeri disalin ke clipboard!');
  };

  const togglePasswordVisibility = (galleryId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [galleryId]: !prev[galleryId],
    }));
  };

  const handleToggleStatus = async (gallery: FamilyGalleryItem) => {
    setActionLoading(`toggle_${gallery.id}`);
    try {
      await FamilyGalleryService.toggleLinkStatus(gallery.id);
      showToast(
        gallery.status === 'active'
          ? 'Tautan dinonaktifkan. Pengunjung tidak dapat lagi mengakses galeri.'
          : 'Tautan diaktifkan kembali.'
      );
      await loadGalleries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status tautan.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeImmediate = async (id: string) => {
    if (!confirm('Cabut akses tautan ini seketika? Semua sesi keluarga yang sedang aktif akan dibatalkan.')) return;
    setActionLoading(`revoke_${id}`);
    try {
      await FamilyGalleryService.revokeGallery(id);
      showToast('Tautan berhasil dicabut dan sesi penonton dihentikan.');
      await loadGalleries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencabut tautan galeri.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus konfigurasi galeri ini? File foto asli di Google Drive TIDAK akan dihapus.')) return;
    setActionLoading(`del_${id}`);
    try {
      await FamilyGalleryService.deleteGallery(id);
      showToast('Konfigurasi galeri dihapus tanpa memengaruhi file Drive asli.');
      await loadGalleries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus galeri.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreationSuccess = (data: SuccessModalData) => {
    setShowCreator(false);
    setSuccessData(data);
    void loadGalleries();
  };

  if (!hasValidToken) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500 dark:text-slate-400">
        <Lock className="h-10 w-10 text-slate-400" />
        <p className="text-sm font-medium">Hubungkan akun Google Anda untuk mengelola Tautan Privat Galeri Keluarga.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Private Family Gallery</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Bagikan foto dan album keluarga secara eksklusif menggunakan <strong>Tautan Privat + Password</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadGalleries()}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Segarkan data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreator(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 text-xs font-semibold transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Buat Tautan Galeri</span>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-2.5 text-xs text-green-700 dark:text-green-300">
          <Check className="h-4 w-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {loading && galleries.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      )}

      {!loading && galleries.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-14 text-center text-slate-400 dark:text-slate-500">
          <Users className="h-12 w-12" />
          <p className="text-sm font-medium">Belum ada tautan galeri privat yang dibuat.</p>
          <p className="text-xs max-w-xs">Buat tautan galeri pertama Anda dengan password untuk dibagikan ke anggota keluarga.</p>
        </div>
      )}

      {/* Gallery Cards */}
      <div className="space-y-3.5">
        {galleries.map((g) => {
          const isPwRevealed = Boolean(revealedPasswords[g.id]);
          return (
            <div
              key={g.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] overflow-hidden shadow-sm"
            >
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold truncate text-slate-900 dark:text-slate-100">{g.name}</h3>
                    {statusBadge(g.status)}
                  </div>

                  {/* Password & Security Row */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Password:</span>
                    {g.displayPassword ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 px-2 py-1 font-mono text-[11px]">
                        <span>{isPwRevealed ? g.displayPassword : '••••••••'}</span>
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(g.id)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title={isPwRevealed ? 'Sembunyikan password' : 'Lihat password'}
                        >
                          {isPwRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyPassword(g.displayPassword)}
                          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 ml-0.5"
                          title="Salin Password"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Dilindungi hash scrypt</span>
                    )}

                    <button
                      type="button"
                      onClick={() => setChangePasswordTarget(g)}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 ml-1"
                    >
                      <Key className="h-3 w-3" /> Ubah Password
                    </button>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <FolderHeart className="h-3 w-3" />
                      {g.contentMode === 'all_albums' ? 'Semua Album Root' : `${g.albums.length} album terpilih`}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Images className="h-3 w-3" /> {g.photos.length} foto kustom
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {g.allowDownloadDefault ? 'Izin Unduh Asli Aktif' : 'Hanya Lihat'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      Default: {g.defaultQuality.toUpperCase()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {g.expiresAt
                        ? `Kedaluwarsa: ${new Date(g.expiresAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : 'Masa Aktif: Tanpa Batas'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800/80 px-4 py-2.5 bg-slate-50/50 dark:bg-[#151820]">
                <button
                  type="button"
                  onClick={() => void handleCopyLink(g)}
                  disabled={Boolean(actionLoading) || g.status === 'revoked'}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors disabled:opacity-40"
                  title="Salin tautan privat untuk keluarga"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Salin Tautan
                </button>

                <button
                  type="button"
                  onClick={() => setExtendExpiryTarget(g)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Perpanjang Waktu
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleStatus(g)}
                  disabled={Boolean(actionLoading)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    g.status === 'active'
                      ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                      : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/40'
                  }`}
                >
                  {g.status === 'active' ? (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5" /> Nonaktifkan Tautan
                    </>
                  ) : (
                    <>
                      <Shield className="h-3.5 w-3.5" /> Aktifkan Tautan
                    </>
                  )}
                </button>

                {g.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeImmediate(g.id)}
                    disabled={Boolean(actionLoading)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    title="Cabut tautan & batalkan semua sesi penonton seketika"
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Cabut Akses
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleDelete(g.id)}
                  disabled={Boolean(actionLoading)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Buat Galeri Baru */}
      {showCreator && (
        <GalleryCreatorModal
          rootFolderId={rootFolderId}
          onClose={() => setShowCreator(false)}
          onSuccess={handleCreationSuccess}
        />
      )}

      {/* Modal Konfirmasi Sukses dengan Tombol Salin Lengkap */}
      {successData && (
        <CreationSuccessModal
          data={successData}
          onClose={() => setSuccessData(null)}
          onToast={showToast}
        />
      )}

      {/* Modal Ganti Password */}
      {changePasswordTarget && (
        <ChangePasswordModal
          gallery={changePasswordTarget}
          onClose={() => setChangePasswordTarget(null)}
          onUpdated={() => {
            setChangePasswordTarget(null);
            showToast('Password galeri berhasil diperbarui!');
            void loadGalleries();
          }}
        />
      )}

      {/* Modal Perpanjang Kedaluwarsa */}
      {extendExpiryTarget && (
        <ExtendExpiryModal
          gallery={extendExpiryTarget}
          onClose={() => setExtendExpiryTarget(null)}
          onUpdated={() => {
            setExtendExpiryTarget(null);
            showToast('Masa kedaluwarsa berhasil diperpanjang!');
            void loadGalleries();
          }}
        />
      )}
    </div>
  );
};

/* ───────── Modal Pembuatan Galeri Baru dengan Pemilih Album & Foto ───────── */

interface GalleryCreatorModalProps {
  rootFolderId?: string | null;
  onClose: () => void;
  onSuccess: (data: SuccessModalData) => void;
}

const GalleryCreatorModal: React.FC<GalleryCreatorModalProps> = ({ rootFolderId, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [contentMode, setContentMode] = useState<GalleryContentMode>('all_albums');
  const [quality, setQuality] = useState<PhotoQualityMode>('auto');
  const [allowDownload, setAllowDownload] = useState(false);
  const [expiryPreset, setExpiryPreset] = useState<string | null>('7d');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Content Selection Data (Hierarchical Folder Tree)
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(() =>
    PendingShareService.getSelectedAlbumIds()
  );

  // Custom photo selection
  const [availablePhotos, setAvailablePhotos] = useState<PhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  // Load recursive folder tree under root when needed
  useEffect(() => {
    if ((contentMode === 'selected_albums' || contentMode === 'mixed') && rootFolderId) {
      setLoadingAlbums(true);
      FolderService.buildRecursiveFolderTree(rootFolderId)
        .then((tree) => setFolderTree(tree))
        .catch((err) => console.error('Gagal memuat struktur hierarki folder:', err))
        .finally(() => setLoadingAlbums(false));
    }
  }, [contentMode, rootFolderId]);

  // Load photos when custom_photos or mixed is selected
  useEffect(() => {
    if ((contentMode === 'custom_photos' || contentMode === 'mixed') && rootFolderId) {
      setLoadingPhotos(true);
      PhotoService.listAllPhotosUnderRoot({
        rootFolderId,
        rootFolderName: 'Root',
        sort: 'date-desc',
        pageSize: 40,
      })
        .then((res) => setAvailablePhotos(res.photos))
        .catch(() => {})
        .finally(() => setLoadingPhotos(false));
    }
  }, [contentMode, rootFolderId]);

  const toggleAlbum = (albumId: string) => {
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  };

  const handleSelectSubtree = (node: FolderTreeNode, selected: boolean) => {
    const descendantIds = FolderService.getAllDescendantIds(node);
    setSelectedAlbumIds((prev) => {
      const next = new Set(prev);
      for (const id of descendantIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const handleSelectAllAlbums = () => {
    const flat = FolderService.flattenFolderTree(folderTree);
    setSelectedAlbumIds(new Set(flat.map((a) => a.id)));
  };

  const handleClearAlbumSelection = () => {
    setSelectedAlbumIds(new Set());
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErr('Nama galeri wajib diisi.');
      return;
    }
    if (!password || password.length < 4) {
      setErr('Password minimal 4 karakter wajib ditentukan untuk tautan privat.');
      return;
    }

    if (contentMode === 'selected_albums' && selectedAlbumIds.size === 0) {
      setErr('Pilih minimal satu album untuk dibagikan.');
      return;
    }

    if (contentMode === 'custom_photos' && selectedPhotoIds.size === 0) {
      setErr('Pilih minimal satu foto untuk dibagikan.');
      return;
    }

    if (contentMode === 'mixed' && selectedAlbumIds.size === 0 && selectedPhotoIds.size === 0) {
      setErr('Pilih minimal satu album atau satu foto untuk mode campuran.');
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      const flatFolders = FolderService.flattenFolderTree(folderTree);
      const folderMap = new Map(flatFolders.map((f) => [f.id, f.name]));

      const albumPerms: GalleryAlbumPermission[] = Array.from(selectedAlbumIds)
        .map((id) => ({
          folderId: id,
          folderName: folderMap.get(id) || 'Album',
          allowDownload,
        }));

      const photoPerms: GalleryPhotoPermission[] = availablePhotos
        .filter((p) => selectedPhotoIds.has(p.id))
        .map((p) => ({
          fileId: p.id,
          parentFolderId: p.folderId,
          fileName: p.name,
          allowDownload,
        }));

      const expiresAt = computeExpiresAt(expiryPreset);

      const result = await FamilyGalleryService.createGallery({
        name: name.trim(),
        contentMode,
        defaultQuality: quality,
        allowDownloadDefault: allowDownload,
        expiresAt,
        password: password.trim(),
        albums: albumPerms,
        photos: photoPerms,
      });

      const shareUrl = FamilyGalleryService.getShareUrl(result.shareToken);

      onSuccess({
        name: name.trim(),
        shareUrl,
        password: password.trim(),
        expiresAt,
        allowDownload,
        quality,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal membuat tautan galeri privat.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#171a21] px-5 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Buat Tautan Galeri Privat</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Nama Galeri */}
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">Nama Galeri</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Liburan Keluarga, Ulang Tahun Anak…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* Password Galeri (Wajib) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Password Akses Keluarga</label>
              <button
                type="button"
                onClick={() => setPassword(Math.random().toString(36).slice(-8))}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                Buat Acak
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 4 karakter"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Password tidak pernah disertakan di tautan dan dienkripsi dengan scrypt.</p>
          </div>

          {/* Cakupan Konten */}
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">Cakupan Konten yang Dibagikan</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['all_albums', 'Semua Album Root'],
                ['selected_albums', 'Album Pilihan'],
                ['custom_photos', 'Foto Pilihan'],
                ['mixed', 'Campuran (Album + Foto)'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setContentMode(v)}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-semibold text-left transition-colors ${
                    contentMode === v
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Selector UI untuk Album & Subfolder Pilihan (Hierarchical Tree) */}
          {(contentMode === 'selected_albums' || contentMode === 'mixed') && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pilih Album & Subfolder ({selectedAlbumIds.size} dipilih)
                </span>
              </div>

              <FolderSelectionTree
                tree={folderTree}
                selectedFolderIds={selectedAlbumIds}
                onToggleFolder={toggleAlbum}
                onSelectSubtree={handleSelectSubtree}
                onSelectAll={handleSelectAllAlbums}
                onClearAll={handleClearAlbumSelection}
                loading={loadingAlbums}
              />
            </div>
          )}

          {/* Selector UI untuk Foto Pilihan */}
          {(contentMode === 'custom_photos' || contentMode === 'mixed') && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pilih Foto Individual ({selectedPhotoIds.size} dipilih)
                </span>
                <span className="text-[11px] text-slate-400">Total {availablePhotos.length} foto tersedia</span>
              </div>

              {loadingPhotos ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                </div>
              ) : availablePhotos.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2 text-center">Belum ada foto yang dimuat dari Drive.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-1">
                  {availablePhotos.map((photo) => {
                    const isSelected = selectedPhotoIds.has(photo.id);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => togglePhoto(photo.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? 'border-blue-600 ring-2 ring-blue-500/30'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={photo.thumbnailLink ? photo.thumbnailLink.replace(/=s\d+/, '=s160') : ''}
                          alt={photo.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-blue-600 text-white rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Masa Kedaluwarsa */}
          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">Masa Kedaluwarsa Tautan</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_PRESETS.map((p) => (
                <button
                  key={p.value ?? 'unlimited'}
                  type="button"
                  onClick={() => setExpiryPreset(p.value)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    expiryPreset === p.value
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Izin Unduh Foto Asli */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Izinkan Unduh Foto Asli</p>
              <p className="text-[11px] text-slate-400">Jika mati, anggota keluarga hanya dapat melihat foto.</p>
            </div>
            <button
              type="button"
              onClick={() => setAllowDownload(!allowDownload)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                allowDownload ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  allowDownload ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Kualitas Tampilan Default */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">Kualitas Tampilan Awal</label>
            <QualitySelector value={quality} onChange={setQuality} variant="cards" />
          </div>

          {err && (
            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-xl border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 shadow-sm"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Buat Tautan & Salin
          </button>
        </div>
      </div>
    </div>
  );
};

/* ───────── Modal Konfirmasi Sukses Pembuatan Tautan ───────── */

interface CreationSuccessModalProps {
  data: SuccessModalData;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const CreationSuccessModal: React.FC<CreationSuccessModalProps> = ({ data, onClose, onToast }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(data.shareUrl);
    setCopiedLink(true);
    onToast('Tautan galeri disalin!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyPassword = async () => {
    await navigator.clipboard.writeText(data.password);
    setCopiedPw(true);
    onToast('Password galeri disalin!');
    setTimeout(() => setCopiedPw(false), 2500);
  };

  const handleCopyBoth = async () => {
    const text = `Halo Keluarga! Silakan buka galeri foto kami:\nTautan: ${data.shareUrl}\nPassword: ${data.password}`;
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    onToast('Tautan + Password berhasil disalin lengkap!');
    setTimeout(() => setCopiedAll(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-2.5 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Galeri Privat Berhasil Dibuat!</h3>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tautan privat untuk <strong>{data.name}</strong> siap dibagikan kepada anggota keluarga Anda.
        </p>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 space-y-3">
          {/* Tautan */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Tautan Galeri:</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={data.shareUrl}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2.5 py-1.5 text-xs font-semibold shrink-0"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Salin
              </button>
            </div>
          </div>

          {/* Password */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 block mb-1">Password Akses:</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={data.password}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCopyPassword()}
                className="flex items-center gap-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2.5 py-1.5 text-xs font-semibold shrink-0"
              >
                {copiedPw ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Salin
              </button>
            </div>
          </div>

          {/* Info ringkas */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800">
            <span>Kedaluwarsa: {data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('id-ID') : 'Tanpa batas'}</span>
            <span>Unduh: {data.allowDownload ? 'Diizinkan' : 'Hanya lihat'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleCopyBoth()}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-semibold shadow-sm"
          >
            {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Salin Tautan + Password
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

/* ───────── Modal Ganti Password ───────── */

interface ChangePasswordModalProps {
  gallery: FamilyGalleryItem;
  onClose: () => void;
  onUpdated: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ gallery, onClose, onUpdated }) => {
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!newPassword || newPassword.length < 4) {
      setError('Password baru minimal 4 karakter.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await FamilyGalleryService.changePassword(gallery.id, newPassword);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memperbarui password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-700 shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Ubah Password Galeri</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mengubah password galeri <strong>{gallery.name}</strong> akan membatalkan semua sesi penonton yang sedang aktif.
        </p>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password baru (min. 4 karakter)"
            autoFocus
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono outline-none"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
          <button type="button" onClick={() => void handleSubmit()} disabled={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-semibold">
            {loading ? 'Menyimpan...' : 'Simpan Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ───────── Modal Perpanjang Kedaluwarsa ───────── */

interface ExtendExpiryModalProps {
  gallery: FamilyGalleryItem;
  onClose: () => void;
  onUpdated: () => void;
}

const ExtendExpiryModal: React.FC<ExtendExpiryModalProps> = ({ gallery, onClose, onUpdated }) => {
  const [selectedPreset, setSelectedPreset] = useState<string | null>('7d');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const expiresAt = computeExpiresAt(selectedPreset);
      await FamilyGalleryService.extendExpiration(gallery.id, expiresAt);
      onUpdated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#171a21] border border-slate-200 dark:border-slate-700 shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Atur Masa Kedaluwarsa</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Pilih masa aktif baru untuk galeri <strong>{gallery.name}</strong>.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXPIRY_PRESETS.map((p) => (
            <button
              key={p.value ?? 'unlimited'}
              type="button"
              onClick={() => setSelectedPreset(p.value)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                selectedPreset === p.value
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
          <button type="button" onClick={() => void handleSave()} disabled={loading} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-semibold">
            {loading ? 'Menyimpan...' : 'Perbarui Waktu'}
          </button>
        </div>
      </div>
    </div>
  );
};
