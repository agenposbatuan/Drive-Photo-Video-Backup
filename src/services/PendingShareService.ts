import { AlbumSummary } from '../types';

type Listener = (selectedAlbumIds: Set<string>, selectedAlbums: AlbumSummary[]) => void;

class PendingShareServiceImpl {
  private selectedAlbumMap = new Map<string, AlbumSummary>();
  private listeners = new Set<Listener>();

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(new Set(this.selectedAlbumMap.keys()), Array.from(this.selectedAlbumMap.values()));
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const ids = new Set(this.selectedAlbumMap.keys());
    const items = Array.from(this.selectedAlbumMap.values());
    this.listeners.forEach((fn) => fn(ids, items));
  }

  public isAlbumSelected(albumId: string): boolean {
    return this.selectedAlbumMap.has(albumId);
  }

  public toggleAlbum(album: AlbumSummary): boolean {
    if (this.selectedAlbumMap.has(album.id)) {
      this.selectedAlbumMap.delete(album.id);
      this.emit();
      return false;
    }
    this.selectedAlbumMap.set(album.id, album);
    this.emit();
    return true;
  }

  public selectAlbum(album: AlbumSummary): void {
    if (!this.selectedAlbumMap.has(album.id)) {
      this.selectedAlbumMap.set(album.id, album);
      this.emit();
    }
  }

  public deselectAlbum(albumId: string): void {
    if (this.selectedAlbumMap.has(albumId)) {
      this.selectedAlbumMap.delete(albumId);
      this.emit();
    }
  }

  public getSelectedAlbums(): AlbumSummary[] {
    return Array.from(this.selectedAlbumMap.values());
  }

  public getSelectedAlbumIds(): Set<string> {
    return new Set(this.selectedAlbumMap.keys());
  }

  public clear(): void {
    if (this.selectedAlbumMap.size > 0) {
      this.selectedAlbumMap.clear();
      this.emit();
    }
  }
}

export const PendingShareService = new PendingShareServiceImpl();
