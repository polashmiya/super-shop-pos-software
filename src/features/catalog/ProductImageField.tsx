import { useRef, useState, type DragEvent } from 'react';
import { ImageUp, Images, Trash2 } from 'lucide-react';
import type { ArtFolder } from '@/data/seed/catalog/artRegistry';
import { useT } from '@/i18n';
import { PRODUCT_IMAGE_MAX_SIDE } from '@/services/catalogService';
import { toast } from '@/stores/uiStore';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/components/ui/cn';
import { ProductImage } from '@/components/product/ProductImage';
import { ArtworkPicker } from './ArtworkPicker';
import { prepareProductPhoto } from './imageUpload';

interface ProductImageFieldProps {
  image: string | null;
  categoryId: string;
  suggestedFolder: ArtFolder | null;
  onChange: (image: string | null) => void;
}

/** Image management: preview, bundled artwork picker, photo upload (drag & drop too) and remove. */
export function ProductImageField({ image, categoryId, suggestedFolder, onChange }: ProductImageFieldProps) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const kind = !image ? 'none' : image.startsWith('data:') ? 'photo' : 'artwork';

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await prepareProductPhoto(file);
      if (result.ok) {
        onChange(result.dataUrl);
        toast.info('catalog.image.uploaded');
      } else {
        toast.error(result.reason === 'type' ? 'catalog.image.invalidType' : result.reason === 'size' ? 'catalog.image.tooLarge' : 'catalog.image.readFailed');
      }
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('relative overflow-hidden rounded-lg border border-border', dragging && 'border-primary ring-2 ring-primary/40')}
      >
        <ProductImage product={{ image, categoryId }} className="aspect-square w-full" rounded={false} iconSize={72} />
        {(dragging || busy) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-overlay text-center text-white">
            {busy ? <Spinner size={24} /> : <ImageUp size={28} aria-hidden />}
            <span className="type-label">{busy ? t('catalog.image.processing') : t('catalog.image.dropHint')}</span>
          </div>
        )}
      </div>
      <p className="type-caption text-center text-fg-subtle">{t(kind === 'none' ? 'catalog.image.none' : kind === 'photo' ? 'catalog.image.photo' : 'catalog.image.artwork')}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button icon={Images} onClick={() => setPickerOpen(true)} disabled={busy}>
          {t('catalog.image.chooseArtwork')}
        </Button>
        <Button icon={ImageUp} loading={busy} onClick={() => fileRef.current?.click()}>
          {t('catalog.image.upload')}
        </Button>
      </div>
      {image && (
        <Button variant="ghost" icon={Trash2} onClick={() => onChange(null)} disabled={busy}>
          {t('catalog.image.remove')}
        </Button>
      )}
      <p className="type-caption text-fg-subtle">{t('catalog.image.hint', { size: PRODUCT_IMAGE_MAX_SIDE })}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {pickerOpen && (
        <ArtworkPicker
          current={image}
          suggestedFolder={suggestedFolder}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => {
            onChange(path);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
