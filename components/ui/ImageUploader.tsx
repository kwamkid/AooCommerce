'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { ImagePlus, X, Loader2, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import imageCompression from 'browser-image-compression';

export interface ProductImage {
  id?: string;
  image_url: string;
  storage_path?: string;
  sort_order: number;
  // For staged (not yet uploaded) images
  _stagedFile?: File;
  _originalName?: string;
}

interface ImageUploaderProps {
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  productId?: string;
  variationId?: string;
  maxImages?: number;
  disabled?: boolean;
  compact?: boolean;
}

// Helper: upload a file to Storage + save metadata via API
async function uploadFileToStorage(
  file: File,
  options: {
    productId?: string | null;
    variationId?: string | null;
    sortOrder: number;
    fileName: string;
  }
): Promise<ProductImage | null> {
  const safeName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = options.variationId
    ? `variations/${options.variationId}`
    : `products/${options.productId}`;
  const storagePath = `${prefix}/${Date.now()}-${safeName}`;

  // Upload directly to Supabase Storage (RLS policy allows authenticated users)
  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(storagePath, file, { contentType: file.type || 'image/jpeg' });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(storagePath);

  // Save metadata via API
  const response = await apiFetch('/api/product-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: options.productId || null,
      variation_id: options.variationId || null,
      image_url: urlData.publicUrl,
      storage_path: storagePath,
      sort_order: options.sortOrder
    })
  });

  if (response.ok) {
    const result = await response.json();
    return {
      id: result.image.id,
      image_url: result.image.image_url,
      storage_path: result.image.storage_path,
      sort_order: result.image.sort_order
    };
  } else {
    const errText = await response.text();
    console.error('API metadata error:', errText);
    // Clean up uploaded file if metadata save fails
    await supabase.storage.from('product-images').remove([storagePath]);
    return null;
  }
}

// Helper: upload staged images to storage + save metadata via API
export async function uploadStagedImages(
  images: ProductImage[],
  productId: string,
  variationId?: string,
): Promise<ProductImage[]> {
  const uploaded: ProductImage[] = [];

  for (const img of images) {
    if (!img._stagedFile) {
      uploaded.push(img);
      continue;
    }

    const fileName = img._originalName || `image-${Date.now()}.jpg`;

    // Retry up to 2 times on failure
    let result: ProductImage | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await uploadFileToStorage(img._stagedFile, {
        productId: variationId ? null : productId,
        variationId: variationId || null,
        sortOrder: img.sort_order,
        fileName
      });
      if (result) break;
      // Wait a bit before retrying
      if (attempt < 2) await new Promise(r => setTimeout(r, 500));
    }

    if (result) {
      uploaded.push(result);
    }
  }

  return uploaded;
}

export default function ImageUploader({
  images,
  onImagesChange,
  productId,
  variationId,
  maxImages = 10,
  disabled = false,
  compact = false
}: ImageUploaderProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isLiveMode = !!(productId || variationId);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowLeft') setLightboxIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev);
      if (e.key === 'ArrowRight') setLightboxIndex(prev => prev !== null && prev < images.length - 1 ? prev + 1 : prev);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, images.length]);

  const processFiles = async (files: File[]) => {
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      showToast(`อัพโหลดได้สูงสุด ${maxImages} รูป`, 'error');
      return;
    }

    const filesToProcess = files.filter(f => f.type.startsWith('image/')).slice(0, remainingSlots);
    if (filesToProcess.length === 0) return;

    setUploading(true);

    try {
      if (isLiveMode) {
        const newImages: ProductImage[] = [];

        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          setUploadProgress(`กำลังอัพโหลด ${i + 1}/${filesToProcess.length}...`);

          const compressedFile = await imageCompression(file, {
            maxSizeMB: 0.25,
            maxWidthOrHeight: 1200,
            useWebWorker: true
          });

          // Convert Blob to File to preserve name
          const namedFile = new File([compressedFile], file.name, {
            type: compressedFile.type || 'image/jpeg'
          });

          const sortOrder = images.length + newImages.length;

          const result = await uploadFileToStorage(namedFile, {
            productId: productId || null,
            variationId: variationId || null,
            sortOrder,
            fileName: file.name
          });

          if (result) {
            newImages.push(result);
          }
        }

        if (newImages.length > 0) {
          onImagesChange([...images, ...newImages]);
        }
      } else {
        // Staged mode: compress + create blob URLs, hold files in memory
        const newImages: ProductImage[] = [];

        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          const originalName = file.name;
          setUploadProgress(`กำลังเตรียมรูป ${i + 1}/${filesToProcess.length}...`);

          const compressedFile = await imageCompression(file, {
            maxSizeMB: 0.25,
            maxWidthOrHeight: 1200,
            useWebWorker: true
          });

          // Convert Blob to File to preserve name
          const namedFile = new File([compressedFile], originalName, {
            type: compressedFile.type || 'image/jpeg'
          });

          const blobUrl = URL.createObjectURL(namedFile);
          const sortOrder = images.length + newImages.length;

          newImages.push({
            image_url: blobUrl,
            sort_order: sortOrder,
            _stagedFile: namedFile,
            _originalName: originalName
          });
        }

        if (newImages.length > 0) {
          onImagesChange([...images, ...newImages]);
        }
      }
    } catch (error) {
      console.error('Error processing images:', error);
      showToast('เกิดข้อผิดพลาดในการจัดการรูปภาพ', 'error');
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || uploading) return;
    setIsDragOver(true);
  }, [disabled, uploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || uploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [disabled, uploading, images, maxImages, productId, variationId, isLiveMode]);

  const handleImageDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleImageDragEnter = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };

  const handleImageDragEnd = async () => {
    if (dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...images];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dragOverIndex, 0, moved);

    const updated = reordered.map((img, i) => ({ ...img, sort_order: i }));
    onImagesChange(updated);

    if (isLiveMode) {
      const liveImages = updated.filter(img => img.id);
      if (liveImages.length > 0) {
        try {
          await apiFetch('/api/product-images', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: liveImages.map(img => ({ id: img.id, sort_order: img.sort_order })) })
          });
        } catch (error) {
          console.error('Error updating sort order:', error);
        }
      }
    }

    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDelete = async (imageToDelete: ProductImage, index: number) => {
    if (imageToDelete._stagedFile) {
      URL.revokeObjectURL(imageToDelete.image_url);
      const updatedImages = images
        .filter((_, i) => i !== index)
        .map((img, i) => ({ ...img, sort_order: i }));
      onImagesChange(updatedImages);
      return;
    }

    if (!imageToDelete.id) return;
    if (!confirm('ต้องการลบรูปภาพนี้?')) return;

    try {
      const response = await apiFetch(`/api/product-images?id=${imageToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const updatedImages = images
          .filter(img => img.id !== imageToDelete.id)
          .map((img, i) => ({ ...img, sort_order: i }));
        onImagesChange(updatedImages);
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      showToast('เกิดข้อผิดพลาดในการลบรูปภาพ', 'error');
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${
        isDragOver
          ? 'border-[#F4511E] bg-[#F4511E]/5 scale-[1.01]'
          : images.length > 0
            ? 'border-gray-200 dark:border-slate-600 bg-gray-50/50 dark:bg-slate-800/50'
            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {images.length > 0 && (
        <div className={compact ? 'p-1' : 'flex flex-wrap gap-3 p-3'}>
          {images.map((image, index) => (
            <div
              key={image.id || `staged-${index}`}
              draggable={!disabled}
              onDragStart={() => handleImageDragStart(index)}
              onDragEnter={() => handleImageDragEnter(index)}
              onDragEnd={handleImageDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`relative group ${compact ? 'w-full aspect-square' : 'w-20 h-20'} rounded-lg overflow-hidden flex-shrink-0 transition-all duration-150 ${
                dragIndex === index ? 'opacity-40 scale-95' : ''
              } ${dragOverIndex === index ? 'ring-2 ring-[#F4511E] ring-offset-2' : ''} ${
                !disabled ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              <img
                src={image.image_url}
                alt={`รูปที่ ${index + 1}`}
                className="w-full h-full object-cover cursor-pointer"
                draggable={false}
                onClick={() => setLightboxIndex(index)}
              />
              {index === 0 && !compact && (
                <span className="absolute bottom-0 left-0 right-0 bg-[#F4511E] text-white text-[9px] font-bold text-center py-0.5">
                  หลัก
                </span>
              )}
              {image._stagedFile && !compact && (
                <span className="absolute top-0 left-0 right-0 bg-blue-500/80 text-white text-[8px] font-bold text-center py-0.5">
                  รอบันทึก
                </span>
              )}
              {!disabled && images.length > 1 && !image._stagedFile && !compact && (
                <div className="absolute top-0.5 left-0.5 bg-black/40 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3 text-white" />
                </div>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(image, index);
                  }}
                  className="absolute top-0.5 right-0.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {!disabled && images.length < maxImages && !uploading && !compact && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-[#F4511E] hover:bg-[#F4511E]/5 flex flex-col items-center justify-center gap-1 transition-colors flex-shrink-0"
            >
              <ImagePlus className="w-5 h-5 text-gray-400 dark:text-slate-500" />
              <span className="text-[10px] text-gray-400 dark:text-slate-500">{images.length}/{maxImages}</span>
            </button>
          )}
        </div>
      )}

      {images.length === 0 && !uploading && (
        compact ? (
          <button
            type="button"
            onClick={() => !disabled && fileInputRef.current?.click()}
            className="w-full aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-xl"
          >
            <ImagePlus className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            <span className="text-[10px] text-gray-400 dark:text-slate-500">เพิ่มรูป</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => !disabled && fileInputRef.current?.click()}
            className="w-full p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-xl"
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-gray-400 dark:text-slate-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-slate-400">
                {isDragOver ? 'วางรูปภาพที่นี่' : 'ลากรูปภาพมาวาง หรือคลิกเพื่อเลือก'}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                รองรับ JPG, PNG สูงสุด {maxImages} รูป
              </p>
            </div>
          </button>
        )
      )}

      {uploading && (
        <div className="flex items-center justify-center gap-2 p-4 text-gray-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-[#F4511E]" />
          <span className="text-sm">{uploadProgress || 'กำลังประมวลผล...'}</span>
        </div>
      )}

      {isDragOver && !uploading && (
        <div className="absolute inset-0 bg-[#F4511E]/10 rounded-xl flex items-center justify-center pointer-events-none z-10">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg px-6 py-3 flex items-center gap-2">
            <ImagePlus className="w-5 h-5 text-[#F4511E]" />
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">วางรูปภาพที่นี่</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      {/* Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full">
            {lightboxIndex + 1} / {images.length}
          </div>

          {/* Prev */}
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Next */}
          {lightboxIndex < images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Image */}
          <img
            src={images[lightboxIndex].image_url}
            alt={`รูปที่ ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/40 rounded-lg p-2 max-w-[90vw] overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img.id || `thumb-${i}`}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}
                  className={`w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all ${
                    i === lightboxIndex ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
