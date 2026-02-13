'use client';

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { ImagePlus, X, Loader2, GripVertical } from 'lucide-react';
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
  token: string,
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
  const response = await fetch('/api/product-images', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
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
// token param is optional — if not provided, will fetch session internally
export async function uploadStagedImages(
  images: ProductImage[],
  productId: string,
  variationId?: string,
  token?: string
): Promise<ProductImage[]> {
  let accessToken = token;
  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session');
    accessToken = session.access_token;
  }

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
      result = await uploadFileToStorage(img._stagedFile, accessToken, {
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

  const isLiveMode = !!(productId || variationId);

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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

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

          const result = await uploadFileToStorage(namedFile, session.access_token, {
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
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch('/api/product-images', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ images: liveImages.map(img => ({ id: img.id, sort_order: img.sort_order })) })
            });
          }
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`/api/product-images?id=${imageToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
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
          ? 'border-[#E9B308] bg-[#E9B308]/5 scale-[1.01]'
          : images.length > 0
            ? 'border-gray-200 bg-gray-50/50'
            : 'border-gray-300 bg-white'
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
              } ${dragOverIndex === index ? 'ring-2 ring-[#E9B308] ring-offset-2' : ''} ${
                !disabled ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              <img
                src={image.image_url}
                alt={`รูปที่ ${index + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {index === 0 && !compact && (
                <span className="absolute bottom-0 left-0 right-0 bg-[#E9B308] text-[#00231F] text-[9px] font-bold text-center py-0.5">
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
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#E9B308] hover:bg-[#E9B308]/5 flex flex-col items-center justify-center gap-1 transition-colors flex-shrink-0"
            >
              <ImagePlus className="w-5 h-5 text-gray-400" />
              <span className="text-[10px] text-gray-400">{images.length}/{maxImages}</span>
            </button>
          )}
        </div>
      )}

      {images.length === 0 && !uploading && (
        compact ? (
          <button
            type="button"
            onClick={() => !disabled && fileInputRef.current?.click()}
            className="w-full aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-gray-50 transition-colors rounded-xl"
          >
            <ImagePlus className="w-5 h-5 text-gray-400" />
            <span className="text-[10px] text-gray-400">เพิ่มรูป</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => !disabled && fileInputRef.current?.click()}
            className="w-full p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors rounded-xl"
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">
                {isDragOver ? 'วางรูปภาพที่นี่' : 'ลากรูปภาพมาวาง หรือคลิกเพื่อเลือก'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                รองรับ JPG, PNG สูงสุด {maxImages} รูป
              </p>
            </div>
          </button>
        )
      )}

      {uploading && (
        <div className="flex items-center justify-center gap-2 p-4 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin text-[#E9B308]" />
          <span className="text-sm">{uploadProgress || 'กำลังประมวลผล...'}</span>
        </div>
      )}

      {isDragOver && !uploading && (
        <div className="absolute inset-0 bg-[#E9B308]/10 rounded-xl flex items-center justify-center pointer-events-none z-10">
          <div className="bg-white rounded-lg shadow-lg px-6 py-3 flex items-center gap-2">
            <ImagePlus className="w-5 h-5 text-[#E9B308]" />
            <span className="text-sm font-medium text-gray-700">วางรูปภาพที่นี่</span>
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
    </div>
  );
}
