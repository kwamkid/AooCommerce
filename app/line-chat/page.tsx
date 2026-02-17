'use client';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import { supabase } from '@/lib/supabase';
import {
  MessageCircle,
  Search,
  Send,
  User,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Link as LinkIcon,
  X,
  Check,
  Phone,
  ShoppingCart,
  History,
  AlertCircle,
  RotateCcw,
  ImagePlus,
  Smile,
  ArrowDown,
  Filter,
  ChevronDown,
  UserCheck,
  UserX,
  Clock,
  Bell,
  UserPlus,
  FileText,
  Download,
  Play,
  Images
} from 'lucide-react';
import Image from 'next/image';
import OrderForm from '@/components/orders/OrderForm';
import CustomerForm, { CustomerFormData } from '@/components/customers/CustomerForm';

interface LineContact {
  id: string;
  line_user_id: string;
  display_name: string;
  picture_url?: string;
  status: string;
  customer_id?: string;
  customer?: {
    id: string;
    name: string;
    customer_code: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    customer_type?: 'retail' | 'wholesale' | 'distributor';
    address?: string;
    district?: string;
    amphoe?: string;
    province?: string;
    postal_code?: string;
    tax_id?: string;
    tax_company_name?: string;
    tax_branch?: string;
    credit_limit?: number;
    credit_days?: number;
    notes?: string;
    is_active?: boolean;
  };
  unread_count: number;
  last_message_at?: string;
  last_message?: string; // Preview of last message
  last_order_date?: string; // Last order date for linked customers
  last_order_created_at?: string; // Last order created_at timestamp (has time)
  avg_order_frequency?: number | null; // Average days between orders
}

interface LineMessage {
  id: string;
  line_contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  content: string;
  sent_by?: string;
  sent_by_user?: {
    id: string;
    name: string;
  };
  // Sender info (for incoming messages)
  sender_user_id?: string;
  sender_name?: string;
  sender_picture_url?: string;
  raw_message?: {
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    lineMessageId?: string; // For LINE content proxy
    imageUrl?: string; // Direct URL or from storage
    videoUrl?: string; // Video URL from storage
    previewUrl?: string; // Video preview image
    contentProvider?: {
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
  created_at: string;
  // Local status for optimistic updates
  _status?: 'sending' | 'sent' | 'failed';
  _tempId?: string; // Temporary ID for optimistic messages
}

interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

interface DayRange {
  minDays: number;
  maxDays: number | null;
  label: string;
  color: string;
}

function LineChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<LineContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const contactsEndRef = useRef<HTMLDivElement>(null);

  // Selected contact state
  const [selectedContact, setSelectedContact] = useState<LineContact | null>(null);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Message input
  const [newMessage, setNewMessage] = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Link customer modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Sticker picker
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  // Scroll to bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Lightbox for images/videos
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Right panel (split view) - desktop only
  const [rightPanel, setRightPanel] = useState<'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail' | null>(null);

  // Mobile view mode
  const [mobileView, setMobileView] = useState<'contacts' | 'chat' | 'order' | 'history' | 'profile' | 'create-customer' | 'edit-customer' | 'order-detail'>('contacts');

  // Order detail view
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Toast notification (using global)

  // Create customer state
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState('');

  // Edit customer state
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editCustomerError, setEditCustomerError] = useState('');

  // Order history data
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Advanced filters
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [filterUnread, setFilterUnread] = useState(false);
  // Filter by order days range: { min: X, max: Y } means "no order between X and Y days ago"
  const [filterOrderDaysRange, setFilterOrderDaysRange] = useState<{ min: number; max: number | null } | null>(null);

  // Day ranges from CRM settings
  const [dayRanges, setDayRanges] = useState<DayRange[]>([]);

  // Check if any filter is active
  const hasActiveFilter = filterLinked !== 'all' || filterUnread || filterOrderDaysRange !== null;

  // Build media list from messages for lightbox navigation
  const mediaList = useMemo(() => {
    return messages
      .filter(m =>
        (m.message_type === 'image' && m.raw_message?.imageUrl) ||
        (m.message_type === 'video' && m.raw_message?.videoUrl)
      )
      .map(m => ({
        url: m.message_type === 'video' ? m.raw_message!.videoUrl! : m.raw_message!.imageUrl!,
        type: (m.message_type === 'video' ? 'video' : 'image') as 'image' | 'video',
        timestamp: m.created_at
      }));
  }, [messages]);

  const openLightbox = useCallback((url: string) => {
    const idx = mediaList.findIndex(m => m.url === url);
    setLightboxIndex(idx >= 0 ? idx : null);
  }, [mediaList]);

  const lightboxMedia = lightboxIndex !== null ? mediaList[lightboxIndex] : null;

  // Fetch CRM settings (day ranges)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await apiFetch('/api/settings/crm');

        if (response.ok) {
          const result = await response.json();
          setDayRanges(result.dayRanges || []);
        }
      } catch (error) {
        console.error('Error fetching CRM settings:', error);
      }
    };

    if (!authLoading && userProfile) {
      fetchSettings();
    }
  }, [authLoading, userProfile]);

  // Get account_id from URL params
  const accountId = searchParams.get('account_id');

  // Fetch contacts
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchContacts();
    }
  }, [authLoading, userProfile, searchTerm, filterLinked, filterUnread, filterOrderDaysRange, accountId]);

  // Auto-select contact from URL param (e.g., /line-chat?user=U1234567890)
  useEffect(() => {
    const lineUserId = searchParams.get('user');
    if (lineUserId && contacts.length > 0 && !selectedContact) {
      const contact = contacts.find(c => c.line_user_id === lineUserId);
      if (contact) {
        setSelectedContact(contact);
        // Clear the URL param after selecting
        router.replace('/line-chat', { scroll: false });
      }
    }
  }, [searchParams, contacts, selectedContact, router]);

  // Fetch messages when contact selected
  useEffect(() => {
    if (selectedContact) {
      fetchMessages(selectedContact.id);
      setMobileView('chat'); // Switch to chat view on mobile
      setRightPanel(null); // Close any open panel (order history, order form, etc.)
      // Focus input when contact selected
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show button if scrolled more than 100px from bottom
    setShowScrollButton(distanceFromBottom > 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sync rightPanel → mobileView when resizing from desktop to mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768 && rightPanel) {
        setMobileView(rightPanel);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [rightPanel]);

  // Close filter popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showFilterPopover && !target.closest('[data-filter-popover]')) {
        setShowFilterPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterPopover]);

  // IntersectionObserver for infinite scroll on contacts list
  useEffect(() => {
    if (!contactsEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreContacts && !loadingMoreContacts && !loadingContacts) {
          fetchContacts(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(contactsEndRef.current);
    return () => observer.disconnect();
  }, [hasMoreContacts, loadingMoreContacts, loadingContacts, contacts.length]);

  // IntersectionObserver for infinite scroll on messages (scroll up to load older)
  useEffect(() => {
    if (!messagesTopRef.current || !selectedContact) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && !loadingMore && !loadingMessages) {
          fetchMessages(selectedContact.id, true);
        }
      },
      { threshold: 0.1, root: messagesContainerRef.current }
    );
    observer.observe(messagesTopRef.current);
    return () => observer.disconnect();
  }, [hasMoreMessages, loadingMore, loadingMessages, selectedContact?.id, messages.length]);

  // Supabase Realtime subscription for new messages
  useEffect(() => {
    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('line_messages_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'line_messages'
        },
        async (payload) => {
          const newMsg = payload.new as LineMessage;

          // If this message is for the selected contact, add it to messages
          if (selectedContact && newMsg.line_contact_id === selectedContact.id) {
            setMessages(prev => {
              // Check if message already exists (by real id)
              const existsById = prev.some(m => m.id === newMsg.id);
              if (existsById) return prev;

              // For outgoing messages: skip if we already have it (handled by sendMessage)
              // Match by content to detect our own optimistic messages
              if (newMsg.direction === 'outgoing') {
                const alreadyHave = prev.some(m => m.content === newMsg.content && m.direction === 'outgoing');
                if (alreadyHave) return prev;
              }

              // New incoming message - just add it
              return [...prev, newMsg];
            });

            // If incoming message for selected contact, reset unread in database
            if (newMsg.direction === 'incoming') {
              // Mark as read by fetching messages (which resets unread_count)
              apiFetch(`/api/line/messages?contact_id=${selectedContact.id}&limit=1`).catch(() => {});
            }
          }

          // Refresh contacts to update unread counts and last_message_at
          fetchContacts();
        }
      )
      .subscribe();

    // Subscribe to contact updates (unread count, last_message_at)
    const contactsChannel = supabase
      .channel('line_contacts_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'line_contacts'
        },
        () => {
          fetchContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [selectedContact]);

  const fetchContacts = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMoreContacts(true);
      }
      const params = new URLSearchParams();
      if (accountId) params.set('account_id', accountId);
      if (searchTerm) params.set('search', searchTerm);
      if (filterUnread) params.set('unread_only', 'true');
      if (filterLinked === 'linked') params.set('linked_only', 'true');
      if (filterLinked === 'unlinked') params.set('unlinked_only', 'true');
      if (filterOrderDaysRange) {
        params.set('order_days_min', filterOrderDaysRange.min.toString());
        if (filterOrderDaysRange.max !== null) {
          params.set('order_days_max', filterOrderDaysRange.max.toString());
        }
      }
      params.set('limit', '30');
      params.set('offset', loadMore ? contacts.length.toString() : '0');

      const response = await apiFetch(`/api/line/contacts?${params.toString()}`);

      if (!response.ok) throw new Error('Failed to fetch contacts');

      const result = await response.json();
      let contactsList = result.contacts || [];

      // If we have a selected contact open, set its unread to 0 (since user is viewing it)
      if (selectedContact) {
        contactsList = contactsList.map((c: LineContact) =>
          c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
        );
      }

      if (loadMore) {
        setContacts(prev => [...prev, ...contactsList]);
      } else {
        setContacts(contactsList);
      }

      setHasMoreContacts(result.summary?.hasMore || false);

      // Calculate total unread
      if (loadMore) {
        // For load more, recalculate from all contacts
        setTotalUnread(prev => prev + contactsList.reduce((sum: number, c: LineContact) => sum + c.unread_count, 0));
      } else {
        const calculatedUnread = contactsList.reduce((sum: number, c: LineContact) => sum + c.unread_count, 0);
        setTotalUnread(calculatedUnread);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoadingContacts(false);
      setLoadingMoreContacts(false);
    }
  };

  const fetchMessages = async (contactId: string, loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoadingMessages(true);
      }
      const offset = loadMore ? messages.length : 0;
      const limit = 50;
      const response = await apiFetch(`/api/line/messages?contact_id=${contactId}&limit=${limit}&offset=${offset}`);

      if (!response.ok) throw new Error('Failed to fetch messages');

      const result = await response.json();
      const newMessages = result.messages || [];

      if (loadMore) {
        // Save scroll position before prepending
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;

        // Prepend older messages
        setMessages(prev => [...newMessages, ...prev]);

        // Restore scroll position after DOM update
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setMessages(newMessages);
      }

      // Check if there are more messages
      setHasMoreMessages(newMessages.length === limit);

      // Update contact's unread count locally
      if (!loadMore) {
        setContacts(prev => prev.map(c =>
          c.id === contactId ? { ...c, unread_count: 0 } : c
        ));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
      setLoadingMore(false);
    }
  };

  // Send bill summary to customer via LINE
  const sendBillToCustomer = async (orderId: string, orderNumber: string, billUrl: string) => {
    if (!selectedContact) return;

    const messageText = `สรุปคำสั่งซื้อ ${orderNumber}\n\nดูรายละเอียดและชำระเงินได้ที่:\n${billUrl}`;
    const tempId = `temp-${Date.now()}`;

    // Optimistic update
    const optimisticMessage: LineMessage = {
      id: tempId,
      _tempId: tempId,
      line_contact_id: selectedContact.id,
      direction: 'outgoing',
      message_type: 'text',
      content: messageText,
      created_at: new Date().toISOString(),
      _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);

    // Close order form, go back to chat
    setMobileView('chat');
    setRightPanel(null);

    // Async send
    const contactId = selectedContact.id;
    try {
      const response = await apiFetch('/api/line/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          message: messageText
        })
      });

      if (!response.ok) throw new Error('Failed');
      const result = await response.json();

      if (result.message) {
        setMessages(prev => prev.map(m =>
          m._tempId === tempId ? { ...result.message, _status: 'sent' as const } : m
        ));
      }
      showToast('ส่งบิลให้ลูกค้าสำเร็จ!');
    } catch {
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
      ));
      showToast('ส่งบิลไม่สำเร็จ', 'error');
    }
  };

  const sendMessage = (retryMessage?: LineMessage) => {
    const messageText = retryMessage?.content || newMessage.trim();
    if (!messageText || !selectedContact) return;

    // Generate temp ID for optimistic update
    const tempId = retryMessage?._tempId || `temp-${Date.now()}`;

    // Optimistic update - add message immediately with 'sending' status
    if (!retryMessage) {
      const optimisticMessage: LineMessage = {
        id: tempId,
        _tempId: tempId,
        line_contact_id: selectedContact.id,
        direction: 'outgoing',
        message_type: 'text',
        content: messageText,
        created_at: new Date().toISOString(),
        _status: 'sending'
      };
      setMessages(prev => [...prev, optimisticMessage]);
      setNewMessage('');
      inputRef.current?.focus();
    } else {
      // Update retry message status back to sending
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'sending' as const } : m
      ));
    }

    // Send async - don't await, let user continue typing
    const contactId = selectedContact.id;
    (async () => {
      try {
        const response = await apiFetch('/api/line/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contactId,
            message: messageText
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to send message');
        }

        const result = await response.json();

        // Update optimistic message with real data
        if (result.message) {
          setMessages(prev => prev.map(m =>
            m._tempId === tempId
              ? { ...result.message, _status: 'sent' as const }
              : m
          ));
        }
      } catch (error) {
        console.error('Error sending message:', error);
        // Mark message as failed
        setMessages(prev => prev.map(m =>
          m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
        ));
      }
    })();
  };

  // Compress image on client side (max 500KB)
  const compressImage = (file: File, maxSizeKB = 500): Promise<Blob> => {
    return new Promise((resolve) => {
      if (file.size <= maxSizeKB * 1024) {
        resolve(file);
        return;
      }

      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down if too large (max 1920px on longest side)
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Try decreasing quality until under maxSizeKB
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) { resolve(file); return; }
              if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) {
                resolve(blob);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            'image/jpeg',
            quality
          );
        };
        tryCompress();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
      return;
    }

    // Validate file size (max 10MB for LINE)
    if (file.size > 10 * 1024 * 1024) {
      showToast('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)', 'error');
      return;
    }

    // Compress image before upload
    const compressed = await compressImage(file);

    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(compressed);

    // Optimistic update
    const optimisticMessage: LineMessage = {
      id: tempId,
      _tempId: tempId,
      line_contact_id: selectedContact.id,
      direction: 'outgoing',
      message_type: 'image',
      content: '[รูปภาพ]',
      raw_message: { imageUrl: localUrl },
      created_at: new Date().toISOString(),
      _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setUploadingImage(true);

    const contactId = selectedContact.id;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Upload compressed image to Supabase Storage
      const fileName = `admin-images/${Date.now()}-${file.name.replace(/\.[^.]+$/, '.jpg')}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, compressed, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // Send via LINE API
      const response = await apiFetch('/api/line/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          type: 'image',
          imageUrl
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send image');
      }

      const result = await response.json();

      // Update optimistic message
      if (result.message) {
        setMessages(prev => prev.map(m =>
          m._tempId === tempId
            ? { ...result.message, _status: 'sent' as const }
            : m
        ));
      }

      URL.revokeObjectURL(localUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
      ));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Send sticker
  const sendSticker = (packageId: string, stickerId: string) => {
    if (!selectedContact) return;

    const tempId = `temp-${Date.now()}`;

    // Optimistic update
    const optimisticMessage: LineMessage = {
      id: tempId,
      _tempId: tempId,
      line_contact_id: selectedContact.id,
      direction: 'outgoing',
      message_type: 'sticker',
      content: '[สติกเกอร์]',
      raw_message: { packageId, stickerId },
      created_at: new Date().toISOString(),
      _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setShowStickerPicker(false);

    const contactId = selectedContact.id;

    (async () => {
      try {
        const response = await apiFetch('/api/line/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contactId,
            type: 'sticker',
            packageId,
            stickerId
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to send sticker');
        }

        const result = await response.json();

        if (result.message) {
          setMessages(prev => prev.map(m =>
            m._tempId === tempId
              ? { ...result.message, _status: 'sent' as const }
              : m
          ));
        }
      } catch (error) {
        console.error('Error sending sticker:', error);
        setMessages(prev => prev.map(m =>
          m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
        ));
      }
    })();
  };

  // LINE Official Stickers (free to use) - using correct sticker IDs
  // Package 1: Moon, James, Brown, Cony, Sally, etc. (packageId: 1, stickers: 1-17)
  // Package 2: Brown and Friends Special (packageId: 2, stickers: 18-47)
  // Package 3: Brown, Cony & Sally (packageId: 3, stickers: 180-195)
  const officialStickers = [
    // Basic LINE characters
    { packageId: '1', stickers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'] },
    // Brown and Friends Special
    { packageId: '2', stickers: ['18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32'] },
    // Brown, Cony and Sally
    { packageId: '3', stickers: ['180', '181', '182', '183', '184', '185', '186', '187', '188', '189', '190', '191', '192', '193', '194', '195'] },
  ];

  const fetchCustomers = async (search: string) => {
    try {
      setLoadingCustomers(true);

      const response = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}&limit=10`);

      if (!response.ok) throw new Error('Failed to fetch customers');

      const result = await response.json();
      setCustomers(result.customers || result || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const linkCustomer = async (customerId: string | null) => {
    if (!selectedContact) return;

    try {
      const response = await apiFetch('/api/line/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedContact.id,
          customer_id: customerId
        })
      });

      if (!response.ok) throw new Error('Failed to link customer');

      // Update local state
      const linkedCustomer = customers.find(c => c.id === customerId);
      setSelectedContact(prev => prev ? {
        ...prev,
        customer_id: customerId || undefined,
        customer: linkedCustomer ? {
          id: linkedCustomer.id,
          name: linkedCustomer.name,
          customer_code: linkedCustomer.customer_code
        } : undefined
      } : null);

      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? {
          ...c,
          customer_id: customerId || undefined,
          customer: linkedCustomer ? {
            id: linkedCustomer.id,
            name: linkedCustomer.name,
            customer_code: linkedCustomer.customer_code
          } : undefined
        } : c
      ));

      setShowLinkModal(false);
    } catch (error) {
      console.error('Error linking customer:', error);
    }
  };

  // Create new customer and link to contact
  const handleCreateCustomer = async (formData: CustomerFormData) => {
    if (!selectedContact) return;

    setSavingCustomer(true);
    setCustomerError('');

    try {
      // Determine billing address (use shipping if same_as_shipping is checked)
      const billingAddress = formData.billing_same_as_shipping ? formData.shipping_address : formData.billing_address;
      const billingDistrict = formData.billing_same_as_shipping ? formData.shipping_district : formData.billing_district;
      const billingAmphoe = formData.billing_same_as_shipping ? formData.shipping_amphoe : formData.billing_amphoe;
      const billingProvince = formData.billing_same_as_shipping ? formData.shipping_province : formData.billing_province;
      const billingPostalCode = formData.billing_same_as_shipping ? formData.shipping_postal_code : formData.billing_postal_code;

      // 1. Create customer with billing address and tax info
      const customerPayload = {
        name: formData.name,
        contact_person: formData.contact_person,
        phone: formData.phone,
        email: formData.email,
        customer_type: formData.customer_type,
        credit_limit: formData.credit_limit,
        credit_days: formData.credit_days,
        is_active: formData.is_active,
        notes: formData.notes,
        // Tax invoice info (if needed)
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        // Billing address fields
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode
      };

      const createResponse = await apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload)
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create customer');
      }

      const newCustomer = await createResponse.json();

      // 2. Create shipping address if provided
      if (formData.shipping_address || formData.shipping_province) {
        const shippingPayload = {
          customer_id: newCustomer.id,
          address_name: formData.shipping_address_name || 'สาขาหลัก',
          contact_person: formData.shipping_contact_person || formData.contact_person,
          phone: formData.shipping_phone || formData.phone,
          address_line1: formData.shipping_address,
          district: formData.shipping_district,
          amphoe: formData.shipping_amphoe,
          province: formData.shipping_province,
          postal_code: formData.shipping_postal_code,
          google_maps_link: formData.shipping_google_maps_link,
          delivery_notes: formData.shipping_delivery_notes,
          is_default: true
        };

        await apiFetch('/api/shipping-addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shippingPayload)
        });
      }

      // 3. Link to LINE contact
      const linkResponse = await apiFetch('/api/line/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedContact.id,
          customer_id: newCustomer.id
        })
      });

      if (!linkResponse.ok) throw new Error('Failed to link customer');

      // 4. Update local state
      setSelectedContact(prev => prev ? {
        ...prev,
        customer_id: newCustomer.id,
        customer: {
          id: newCustomer.id,
          name: newCustomer.name,
          customer_code: newCustomer.customer_code
        }
      } : null);

      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? {
          ...c,
          customer_id: newCustomer.id,
          customer: {
            id: newCustomer.id,
            name: newCustomer.name,
            customer_code: newCustomer.customer_code
          }
        } : c
      ));

      // Close panel
      setRightPanel(null);
      setMobileView('chat');

    } catch (error) {
      console.error('Error creating customer:', error);
      setCustomerError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
      throw error;
    } finally {
      setSavingCustomer(false);
    }
  };

  // Open create customer panel
  const handleOpenCreateCustomer = () => {
    setCustomerError('');

    if (window.innerWidth < 768) {
      setMobileView('create-customer');
    } else {
      setRightPanel('create-customer');
    }
  };

  // Open edit customer panel
  const handleOpenEditCustomer = () => {
    setEditCustomerError('');

    if (window.innerWidth < 768) {
      setMobileView('edit-customer');
    } else {
      setRightPanel('edit-customer');
    }
  };

  // Update customer from chat
  const handleUpdateCustomerInChat = async (formData: CustomerFormData) => {
    if (!selectedContact?.customer) return;

    setEditingCustomer(true);
    setEditCustomerError('');

    try {
      // Determine billing address (use shipping if same_as_shipping is checked)
      const billingAddress = formData.billing_same_as_shipping ? formData.shipping_address : formData.billing_address;
      const billingDistrict = formData.billing_same_as_shipping ? formData.shipping_district : formData.billing_district;
      const billingAmphoe = formData.billing_same_as_shipping ? formData.shipping_amphoe : formData.billing_amphoe;
      const billingProvince = formData.billing_same_as_shipping ? formData.shipping_province : formData.billing_province;
      const billingPostalCode = formData.billing_same_as_shipping ? formData.shipping_postal_code : formData.billing_postal_code;

      const payload = {
        id: selectedContact.customer.id,
        name: formData.name,
        contact_person: formData.contact_person,
        phone: formData.phone,
        email: formData.email,
        customer_type: formData.customer_type,
        credit_limit: formData.credit_limit,
        credit_days: formData.credit_days,
        is_active: formData.is_active,
        notes: formData.notes,
        // Tax invoice info (if needed)
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        // Billing address fields
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode
      };

      const response = await apiFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update customer');
      }

      // Update local state with new customer data
      const updatedCustomer = {
        ...selectedContact.customer,
        name: formData.name,
        contact_person: formData.contact_person,
        phone: formData.phone,
        email: formData.email,
        customer_type: formData.customer_type as 'retail' | 'wholesale' | 'distributor',
        address: billingAddress,
        district: billingDistrict,
        amphoe: billingAmphoe,
        province: billingProvince,
        postal_code: billingPostalCode,
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        credit_limit: formData.credit_limit,
        credit_days: formData.credit_days,
        notes: formData.notes,
        is_active: formData.is_active
      };

      setSelectedContact(prev => prev ? {
        ...prev,
        customer: updatedCustomer
      } : null);

      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? {
          ...c,
          customer: updatedCustomer
        } : c
      ));

      // Close panel and go back to profile
      setRightPanel('profile');
      setMobileView('chat');

    } catch (error) {
      console.error('Error updating customer:', error);
      setEditCustomerError(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
      throw error;
    } finally {
      setEditingCustomer(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) +
      ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastMessage = (dateString?: string) => {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'เมื่อกี้';
    if (diffMins < 60) return `${diffMins} นาที`;
    if (diffHours < 24) return `${diffHours} ชม.`;
    if (diffDays < 7) return `${diffDays} วัน`;
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  // Fetch order history for customer
  const fetchOrderHistory = async (customerId: string) => {
    try {
      setLoadingHistory(true);

      const response = await apiFetch(`/api/orders?customer_id=${customerId}&limit=20`);

      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      setOrderHistory(result.orders || []);
    } catch (error) {
      console.error('Error fetching order history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle opening history panel
  const handleOpenHistory = () => {
    if (!selectedContact?.customer) return;

    if (window.innerWidth < 768) {
      setMobileView('history');
    } else {
      setRightPanel(rightPanel === 'history' ? null : 'history');
    }
    fetchOrderHistory(selectedContact.customer.id);
  };

  // Handle opening profile panel
  const handleOpenProfile = () => {
    if (!selectedContact?.customer) return;

    if (window.innerWidth < 768) {
      setMobileView('profile');
    } else {
      setRightPanel(rightPanel === 'profile' ? null : 'profile');
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex h-[calc(100vh-120px)] bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Contacts Sidebar - hidden on mobile when chat or order is open */}
        <div className={`w-full md:w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col ${mobileView !== 'contacts' ? 'hidden md:flex' : 'flex'} ${rightPanel ? 'md:hidden xl:flex' : ''}`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#06C755]" />
                LINE Chat
              </h2>
              {totalUnread > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </div>
            {/* Quick filter - Order days (dynamic from CRM settings) */}
            <div className="flex flex-wrap gap-1 mb-2">
              {/* "All" button */}
              <button
                onClick={() => {
                  setFilterOrderDaysRange(null);
                  setFilterLinked('all');
                }}
                className={`px-2 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                  filterOrderDaysRange === null && filterLinked !== 'linked'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                ทั้งหมด
              </button>

              {/* Dynamic range buttons from settings */}
              {dayRanges.map((range) => {
                const isActive = filterOrderDaysRange?.min === range.minDays && filterOrderDaysRange?.max === range.maxDays;
                const colorClasses: Record<string, { active: string; inactive: string }> = {
                  green: { active: 'bg-green-500 text-white', inactive: 'bg-green-50 text-green-700 hover:bg-green-100' },
                  emerald: { active: 'bg-emerald-500 text-white', inactive: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                  yellow: { active: 'bg-yellow-500 text-white', inactive: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
                  amber: { active: 'bg-amber-500 text-white', inactive: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
                  orange: { active: 'bg-orange-500 text-white', inactive: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
                  red: { active: 'bg-red-500 text-white', inactive: 'bg-red-50 text-red-700 hover:bg-red-100' },
                  pink: { active: 'bg-pink-500 text-white', inactive: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
                  purple: { active: 'bg-purple-500 text-white', inactive: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
                  blue: { active: 'bg-blue-500 text-white', inactive: 'bg-blue-50 text-blue-700 dark:text-blue-400 hover:bg-blue-100' },
                  gray: { active: 'bg-gray-500 text-white', inactive: 'bg-gray-50 text-gray-700 hover:bg-gray-100' }
                };
                const colors = colorClasses[range.color] || colorClasses.gray;

                return (
                  <button
                    key={`${range.minDays}-${range.maxDays}`}
                    onClick={() => {
                      setFilterOrderDaysRange({ min: range.minDays, max: range.maxDays });
                      setFilterLinked('linked'); // Auto select linked when filtering by order days
                    }}
                    className={`px-2 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                      isActive ? colors.active : colors.inactive
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {range.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาชื่อ..."
                  className="w-full h-[42px] pl-9 pr-4 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                />
              </div>
              {/* Filter button */}
              <div className="relative h-[42px]" data-filter-popover>
                <button
                  onClick={() => setShowFilterPopover(!showFilterPopover)}
                  className={`h-full w-[42px] flex items-center justify-center border rounded-lg transition-colors ${hasActiveFilter ? 'bg-[#06C755] border-[#06C755] text-white' : 'border-gray-300 dark:border-slate-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  title="กรองรายชื่อ"
                >
                  <Filter className="w-5 h-5" />
                </button>

                {/* Filter Popover */}
                {showFilterPopover && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                    <div className="p-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">กรองรายชื่อ</span>
                      {hasActiveFilter && (
                        <button
                          onClick={() => {
                            setFilterLinked('all');
                            setFilterUnread(false);
                            setFilterOrderDaysRange(null);
                          }}
                          className="text-xs text-red-500 hover:text-red-600"
                        >
                          ล้างทั้งหมด
                        </button>
                      )}
                    </div>

                    <div className="p-3 space-y-4">
                      {/* Link status filter */}
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2 block">สถานะเชื่อมลูกค้า</label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setFilterLinked('all')}
                            className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                            title="ทั้งหมด"
                          >
                            <User className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setFilterLinked('linked')}
                            className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'linked' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                            title="เชื่อมลูกค้าแล้ว"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setFilterLinked('unlinked');
                              setFilterOrderDaysRange(null);
                            }}
                            className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'unlinked' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                            title="ยังไม่เชื่อมลูกค้า"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Unread filter */}
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2 block">ข้อความใหม่</label>
                        <button
                          onClick={() => setFilterUnread(!filterUnread)}
                          className={`px-3 py-2 rounded-lg transition-colors flex items-center justify-center ${filterUnread ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                          title="เฉพาะข้อความที่ยังไม่อ่าน"
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                      </div>

                    </div>

                    <div className="p-3 border-t border-gray-100 dark:border-slate-700">
                      <button
                        onClick={() => setShowFilterPopover(false)}
                        className="w-full px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        ปิด
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active filters display */}
            {hasActiveFilter && (
              <div className="flex flex-wrap gap-1 mt-2">
                {filterLinked === 'linked' && !filterOrderDaysRange && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                    <UserCheck className="w-3 h-3" />
                    เชื่อมลูกค้าแล้ว
                    <button onClick={() => setFilterLinked('all')} className="ml-1 hover:text-blue-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterLinked === 'unlinked' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                    <UserX className="w-3 h-3" />
                    ยังไม่เชื่อมลูกค้า
                    <button onClick={() => setFilterLinked('all')} className="ml-1 hover:text-orange-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterUnread && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                    <Bell className="w-3 h-3" />
                    ยังไม่อ่าน
                    <button onClick={() => setFilterUnread(false)} className="ml-1 hover:text-red-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filterOrderDaysRange !== null && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                    filterOrderDaysRange.min >= 7 ? 'bg-red-100 text-red-700' :
                    filterOrderDaysRange.min >= 5 ? 'bg-orange-100 text-orange-700' :
                    filterOrderDaysRange.min >= 3 ? 'bg-amber-100 text-amber-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    <Clock className="w-3 h-3" />
                    ไม่สั่ง {filterOrderDaysRange.max === null
                      ? `${filterOrderDaysRange.min}+ วัน`
                      : `${filterOrderDaysRange.min}-${filterOrderDaysRange.max} วัน`}
                    <button onClick={() => { setFilterOrderDaysRange(null); setFilterLinked('all'); }} className="ml-1 hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>ยังไม่มีข้อความ</p>
              </div>
            ) : (
              <>
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700 ${selectedContact?.id === contact.id ? 'bg-[#06C755]/10' : ''
                      }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {contact.picture_url ? (
                        <Image
                          src={contact.picture_url}
                          alt={contact.display_name}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-[#06C755] rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-white" />
                        </div>
                      )}
                      {contact.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                          {contact.unread_count > 9 ? '9+' : contact.unread_count}
                        </span>
                      )}
                      {/* Linked customer indicator */}
                      {contact.customer && (
                        <span className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white dark:border-slate-800">
                          <LinkIcon className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-white truncate">
                          {contact.display_name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {formatLastMessage(contact.last_message_at)}
                        </span>
                      </div>
                      {/* Last message preview */}
                      {contact.last_message ? (
                        <div className="text-xs text-gray-500 truncate">
                          {contact.last_message}
                        </div>
                      ) : contact.customer ? (
                        <div className="text-xs text-[#06C755] truncate flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" />
                          {contact.customer.customer_code} - {contact.customer.name}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-slate-500">ยังไม่มีข้อความ</div>
                      )}
                      {/* Show last order date when filtering by linked customers */}
                      {filterLinked === 'linked' && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {contact.last_order_date
                            ? `สั่งล่าสุด: ${new Date(contact.last_order_created_at || contact.last_order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}${contact.last_order_created_at ? ' ' + new Date(contact.last_order_created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}`
                            : 'ยังไม่เคยสั่ง'}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {/* Infinite scroll sentinel */}
                <div ref={contactsEndRef} className="py-2">
                  {loadingMoreContacts && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat Area - shrinks when right panel is open */}
        <div className={`flex-col relative ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} ${rightPanel ? 'w-full md:w-[340px] xl:w-[420px]' : 'flex-1'}`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between min-h-[81px]">
                <div className="flex items-center gap-3">
                  {/* Back button - mobile only */}
                  <button
                    onClick={() => {
                      setSelectedContact(null);
                      setMobileView('contacts');
                    }}
                    className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  {selectedContact.picture_url ? (
                    <Image
                      src={selectedContact.picture_url}
                      alt={selectedContact.display_name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-[#06C755] rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{selectedContact.display_name}</h3>
                    {selectedContact.customer ? (
                      <div className="flex flex-col">
                        <p className="text-xs text-[#06C755]">
                          {selectedContact.customer.name}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400">
                          {selectedContact.last_order_date ? (
                            <>
                              ล่าสุด {new Date(selectedContact.last_order_created_at || selectedContact.last_order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {selectedContact.last_order_created_at && new Date(selectedContact.last_order_created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </>
                          ) : (
                            <span className="text-orange-500">ยังไม่เคยสั่ง</span>
                          )}
                        </p>
                        {selectedContact.avg_order_frequency != null && (
                          <p className="text-[10px] text-gray-400 dark:text-slate-500">
                            {selectedContact.avg_order_frequency <= 1 ? 'สั่งทุกวัน' : `~${selectedContact.avg_order_frequency} วัน/ออเดอร์`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowLinkModal(true);
                          setCustomerSearch('');
                          setCustomers([]);
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <LinkIcon className="w-3 h-3" />
                        เชื่อมกับลูกค้าในระบบ
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 md:gap-2">
                  {selectedContact.customer ? (
                    <>
                      {/* Order History Button */}
                      <button
                        onClick={handleOpenHistory}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                          rightPanel === 'history'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                        title="ดูประวัติออเดอร์"
                      >
                        <History className="w-4 h-4" />
                        {!rightPanel && <span className="hidden sm:inline">ประวัติ</span>}
                      </button>
                      {/* Open Order Button */}
                      <button
                        onClick={() => {
                          if (window.innerWidth < 768) {
                            setMobileView('order');
                          } else {
                            setRightPanel(rightPanel === 'order' ? null : 'order');
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                          rightPanel === 'order'
                            ? 'bg-[#F4511E] text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                        title={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {!rightPanel && <span className="hidden sm:inline">เปิดบิล</span>}
                      </button>
                      {/* Customer Profile Button */}
                      <button
                        onClick={handleOpenProfile}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                          rightPanel === 'profile'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                        title="ดูข้อมูลลูกค้า"
                      >
                        <User className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Create Customer Button - for unlinked contacts */}
                      <button
                        onClick={handleOpenCreateCustomer}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                          rightPanel === 'create-customer'
                            ? 'bg-blue-500 text-white'
                            : 'bg-blue-100 text-blue-700 dark:text-blue-400 hover:bg-blue-200'
                        }`}
                        title="สร้างลูกค้าใหม่"
                      >
                        <UserPlus className="w-4 h-4" />
                        {!rightPanel && <span className="hidden sm:inline">สร้างลูกค้า</span>}
                      </button>
                      {/* Link Existing Customer Button */}
                      <button
                        onClick={() => {
                          setShowLinkModal(true);
                          setCustomerSearch('');
                          setCustomers([]);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"
                        title="เชื่อมลูกค้าที่มีอยู่"
                      >
                        <LinkIcon className="w-4 h-4" />
                        {!rightPanel && <span className="hidden sm:inline">เชื่อมลูกค้า</span>}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900 relative"
              >
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                    <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>ยังไม่มีข้อความ</p>
                  </div>
                ) : (
                  <>
                    {/* Infinite scroll sentinel for older messages */}
                    <div ref={messagesTopRef} className="py-1">
                      {loadingMore && (
                        <div className="flex items-center justify-center py-2">
                          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                        </div>
                      )}
                    </div>
                    {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'} gap-2`}
                    >
                      {/* Sender Avatar (for incoming messages) */}
                      {msg.direction === 'incoming' && (
                        <div className="flex-shrink-0 self-end">
                          {msg.sender_picture_url ? (
                            <Image
                              src={msg.sender_picture_url}
                              alt={msg.sender_name || 'User'}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gray-300 dark:bg-slate-600 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-gray-500" />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col">
                        {/* Sender name (for incoming messages) */}
                        {msg.direction === 'incoming' && msg.sender_name && (
                          <span className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_name}</span>
                        )}

                        <div className="flex items-end gap-1.5">
                          {/* Status + Timestamp (before bubble for outgoing) */}
                          {msg.direction === 'outgoing' && (
                            <div className="flex flex-col items-end self-end mb-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                              {msg.sent_by_user && <span>{msg.sent_by_user.name}</span>}
                              <div className="flex items-center gap-1">
                                {msg._status === 'failed' && (
                                  <button
                                    onClick={() => { sendMessage(msg); }}
                                    className="flex items-center gap-0.5 text-red-500 hover:text-red-600"
                                    title="ส่งไม่สำเร็จ กดเพื่อลองใหม่"
                                  >
                                    <AlertCircle className="w-3 h-3" />
                                    <RotateCcw className="w-2.5 h-2.5" />
                                  </button>
                                )}
                                {msg._status === 'sending' && (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin text-gray-400" />
                                )}
                                {msg._status === 'sent' && (
                                  <Check className="w-2.5 h-2.5 text-[#06C755]" />
                                )}
                                <span>{formatTime(msg.created_at)}</span>
                              </div>
                            </div>
                          )}

                          <div
                            className={`rounded-2xl max-w-[75vw] md:max-w-[min(70vw,400px)] ${msg.message_type === 'sticker' ? 'bg-transparent' : msg.direction === 'outgoing'
                              ? msg._status === 'failed'
                                ? 'bg-red-400 text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                                : msg._status === 'sending'
                                  ? 'bg-[#06C755]/70 text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                                  : 'bg-[#06C755] text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                              : 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-bl-sm shadow-sm px-3 py-1.5 md:px-4 md:py-2'
                            }`}
                          >
                            {/* Sticker */}
                            {msg.message_type === 'sticker' && msg.raw_message?.stickerId ? (
                              <img
                                src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${msg.raw_message.stickerId}/iPhone/sticker@2x.png`}
                                alt="sticker"
                                className="w-24 h-24 object-contain"
                                onError={(e) => {
                                  const img = e.target as HTMLImageElement;
                                  const stickerId = msg.raw_message?.stickerId;
                                  // Try different formats
                                  if (img.src.includes('sticker@2x.png')) {
                                    img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker.png`;
                                  } else if (img.src.includes('sticker.png')) {
                                    img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
                                  }
                                }}
                              />
                            ) : msg.message_type === 'image' && msg.raw_message?.imageUrl ? (
                              /* Image from storage */
                              <img
                                src={msg.raw_message.imageUrl}
                                alt="image"
                                className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => openLightbox(msg.raw_message!.imageUrl!)}
                                onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                              />
                            ) : msg.message_type === 'video' && msg.raw_message?.videoUrl ? (
                              /* Video from storage */
                              <div
                                className="relative max-w-full max-h-64 rounded-lg cursor-pointer overflow-hidden group"
                                onClick={() => openLightbox(msg.raw_message!.videoUrl!)}
                              >
                                {msg.raw_message.previewUrl ? (
                                  <img src={msg.raw_message.previewUrl} alt="video preview" className="max-w-full max-h-64 rounded-lg" onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} />
                                ) : (
                                  <div className="w-48 h-32 bg-gray-800 rounded-lg flex items-center justify-center">
                                    <Play className="w-10 h-10 text-white" />
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                                  <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                    <Play className="w-6 h-6 text-gray-800 ml-0.5" />
                                  </div>
                                </div>
                              </div>
                            ) : msg.message_type === 'location' && msg.raw_message?.latitude && msg.raw_message?.longitude ? (
                              /* Location */
                              <a
                                href={`https://www.google.com/maps?q=${msg.raw_message.latitude},${msg.raw_message.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">📍</span>
                                  <span className="underline">{msg.content}</span>
                                </div>
                                {msg.raw_message.address && (
                                  <p className="text-xs opacity-70 mt-1">{msg.raw_message.address}</p>
                                )}
                              </a>
                            ) : (
                              /* Text and other messages */
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                          </div>

                          {/* Timestamp (after bubble for incoming) */}
                          {msg.direction === 'incoming' && (
                            <span className="text-[10px] text-gray-400 self-end mb-0.5 whitespace-nowrap">
                              {formatTime(msg.created_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button - floating */}
              {showScrollButton && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-24 left-1/2 -translate-x-1/2 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:shadow-2xl transition-all z-20 animate-bounce"
                  title="ไปที่ข้อความล่าสุด"
                >
                  <ArrowDown className="w-5 h-5 text-[#06C755]" />
                </button>
              )}

              {/* Message Input */}
              <div className="p-2 md:p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 relative">
                {/* Sticker Picker */}
                {showStickerPicker && (
                  <div className="absolute bottom-full left-0 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-t-lg shadow-lg max-h-48 md:max-h-64 overflow-y-auto">
                    <div className="p-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800">
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">เลือกสติกเกอร์</span>
                      <button
                        onClick={() => setShowStickerPicker(false)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-2">
                      {officialStickers.map((pack) => (
                        <div key={pack.packageId} className="mb-3">
                          <div className="grid grid-cols-4 gap-1 md:gap-2">
                            {pack.stickers.map((stickerId) => (
                              <button
                                key={stickerId}
                                onClick={() => sendSticker(pack.packageId, stickerId)}
                                className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                              >
                                <img
                                  src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker@2x.png`}
                                  alt="sticker"
                                  className="w-10 h-10 md:w-12 md:h-12 object-contain"
                                  onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    if (img.src.includes('@2x')) {
                                      img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker.png`;
                                    }
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1 md:gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  {/* Image upload button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="p-2 text-gray-500 hover:text-[#06C755] hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors disabled:opacity-50"
                    title="ส่งรูปภาพ"
                  >
                    {uploadingImage ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-5 h-5" />
                    )}
                  </button>

                  {/* Sticker button */}
                  <button
                    onClick={() => setShowStickerPicker(!showStickerPicker)}
                    className={`p-2 rounded-full transition-colors ${showStickerPicker ? 'text-[#06C755] bg-[#06C755]/10' : 'text-gray-500 hover:text-[#06C755] hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                    title="ส่งสติกเกอร์"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="พิมพ์ข้อความ..."
                    className="flex-1 min-w-0 px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#06C755]"
                  />
                  <button
                    onClick={() => { sendMessage(); }}
                    disabled={!newMessage.trim()}
                    className="p-2 bg-[#06C755] text-white rounded-full hover:bg-[#05b04c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-900">
              <div className="text-center text-gray-500 dark:text-slate-400">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">เลือกแชทเพื่อเริ่มสนทนา</p>
                <p className="text-sm">ข้อความจากลูกค้าจะแสดงที่นี่</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Order View - Full screen on mobile */}
        {mobileView === 'order' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('chat')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <ShoppingCart className="w-5 h-5 text-[#F4511E]" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedContact.customer.customer_code} - {selectedContact.customer.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Order Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <OrderForm
                preselectedCustomerId={selectedContact.customer.id}
                embedded={true}
                onSuccess={(orderId) => {
                  setMobileView('chat');
                  showToast('สร้างคำสั่งซื้อสำเร็จ!');
                }}
                onSendBillToChat={sendBillToCustomer}
                onCancel={() => setMobileView('chat')}
              />
            </div>
          </div>
        )}

        {/* Mobile History View - Full screen on mobile */}
        {mobileView === 'history' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('chat')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <History className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedContact.customer.customer_code} - {selectedContact.customer.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Order History List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : orderHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>ยังไม่มีประวัติออเดอร์</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orderHistory.map((order) => {
                    const orderStatus = order.order_status || order.status;
                    return (
                      <div
                        key={order.id}
                        className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-blue-300 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          if (window.innerWidth < 768) {
                            setMobileView('order-detail');
                          } else {
                            setRightPanel('order-detail');
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{order.order_number}</span>
                            {order.order_date && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                เปิดบิล {new Date(order.created_at || order.order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {order.created_at && new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            orderStatus === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            orderStatus === 'new' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            orderStatus === 'shipping' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                            orderStatus === 'cancelled' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                          }`}>
                            {orderStatus === 'completed' ? 'เสร็จสิ้น' :
                             orderStatus === 'new' ? 'ใหม่' :
                             orderStatus === 'shipping' ? 'กำลังส่ง' :
                             orderStatus === 'cancelled' ? 'ยกเลิก' :
                             orderStatus}
                          </span>
                        </div>
                        {order.branch_names && order.branch_names.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {order.branch_names.map((name: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-sm text-gray-500 dark:text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>
                              {order.delivery_date
                                ? `จัดส่ง ${new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
                                : 'ยังไม่กำหนดจัดส่ง'}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">฿{formatPrice(order.total_amount)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile Profile View - Full screen on mobile */}
        {mobileView === 'profile' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('chat')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <User className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลลูกค้า</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>
                </div>
              </div>
              <button
                onClick={handleOpenEditCustomer}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors"
              >
                แก้ไข
              </button>
            </div>

            {/* Customer Info */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
                {/* Header with picture */}
                <div className="text-center pb-4 border-b border-gray-100 dark:border-slate-700">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedContact.customer.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>
                  <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedContact.customer.customer_type === 'retail' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                    selectedContact.customer.customer_type === 'wholesale' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' :
                    'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                  }`}>
                    {selectedContact.customer.customer_type === 'retail' ? 'ขายปลีก' :
                     selectedContact.customer.customer_type === 'wholesale' ? 'ขายส่ง' : 'ตัวแทนจำหน่าย'}
                  </span>
                </div>

                {/* Contact info */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400">LINE</label>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" />
                      {selectedContact.display_name}
                    </p>
                  </div>

                  {selectedContact.customer.contact_person && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">ผู้ติดต่อ</label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.contact_person}</p>
                    </div>
                  )}

                  {selectedContact.customer.phone && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">เบอร์โทร</label>
                      <a
                        href={`tel:${selectedContact.customer.phone}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {selectedContact.customer.phone}
                      </a>
                    </div>
                  )}

                  {selectedContact.customer.email && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">อีเมล</label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.email}</p>
                    </div>
                  )}
                </div>

                {/* Address */}
                {(selectedContact.customer.address || selectedContact.customer.province) && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">ที่อยู่ออกบิล</label>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {[
                        selectedContact.customer.address,
                        selectedContact.customer.district,
                        selectedContact.customer.amphoe,
                        selectedContact.customer.province,
                        selectedContact.customer.postal_code
                      ].filter(Boolean).join(' ')}
                    </p>
                  </div>
                )}

                {/* Tax info */}
                {selectedContact.customer.tax_id && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">ข้อมูลใบกำกับภาษี</label>
                    {selectedContact.customer.tax_company_name && (
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.tax_company_name}</p>
                    )}
                    <p className="text-sm text-gray-600 dark:text-slate-400">เลขผู้เสียภาษี: {selectedContact.customer.tax_id}</p>
                    {selectedContact.customer.tax_branch && (
                      <p className="text-sm text-gray-600 dark:text-slate-400">สาขา: {selectedContact.customer.tax_branch}</p>
                    )}
                  </div>
                )}

                {/* Credit info */}
                {(selectedContact.customer.credit_limit || selectedContact.customer.credit_days) ? (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">เงื่อนไขเครดิต</label>
                    <div className="flex gap-4 mt-1">
                      {selectedContact.customer.credit_limit ? (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-slate-400">วงเงิน</span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">฿{formatPrice(selectedContact.customer.credit_limit)}</p>
                        </div>
                      ) : null}
                      {selectedContact.customer.credit_days ? (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-slate-400">ระยะเวลา</span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.credit_days} วัน</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Notes */}
                {selectedContact.customer.notes && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">หมายเหตุ</label>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedContact.customer.notes}</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="pt-4 border-t border-gray-100 dark:border-slate-700 space-y-2">
                  <button
                    onClick={() => setMobileView('order')}
                    className="w-full py-2 bg-[#F4511E] text-white rounded-lg font-medium hover:bg-[#D63B0E] transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    เปิดบิล
                  </button>
                  <button
                    onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')}
                    className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    ดูรายละเอียดเต็ม
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Edit Customer View - Full screen on mobile */}
        {mobileView === 'edit-customer' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('profile')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <User className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>
                </div>
              </div>
            </div>

            {/* Edit Customer Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <CustomerForm
                compact={true}
                initialData={{
                  name: selectedContact.customer.name || '',
                  contact_person: selectedContact.customer.contact_person || '',
                  phone: selectedContact.customer.phone || '',
                  email: selectedContact.customer.email || '',
                  customer_type: selectedContact.customer.customer_type || 'retail',
                  credit_limit: selectedContact.customer.credit_limit || 0,
                  credit_days: selectedContact.customer.credit_days || 0,
                  is_active: selectedContact.customer.is_active ?? true,
                  notes: selectedContact.customer.notes || '',
                  needs_tax_invoice: !!selectedContact.customer.tax_id,
                  tax_id: selectedContact.customer.tax_id || '',
                  tax_company_name: selectedContact.customer.tax_company_name || '',
                  tax_branch: selectedContact.customer.tax_branch || 'สำนักงานใหญ่',
                  billing_address: selectedContact.customer.address || '',
                  billing_district: selectedContact.customer.district || '',
                  billing_amphoe: selectedContact.customer.amphoe || '',
                  billing_province: selectedContact.customer.province || '',
                  billing_postal_code: selectedContact.customer.postal_code || '',
                  billing_same_as_shipping: false
                }}
                onSubmit={handleUpdateCustomerInChat}
                onCancel={() => setMobileView('profile')}
                isEditing={true}
                isLoading={editingCustomer}
                error={editCustomerError}
              />
            </div>
          </div>
        )}

        {/* Mobile Create Customer View - Full screen on mobile */}
        {mobileView === 'create-customer' && selectedContact && !selectedContact.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('chat')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <UserPlus className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้างลูกค้าใหม่</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">LINE: {selectedContact.display_name}</p>
                </div>
              </div>
            </div>

            {/* Create Customer Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <CustomerForm
                compact={true}
                lineDisplayName={selectedContact.display_name}
                onSubmit={handleCreateCustomer}
                onCancel={() => setMobileView('chat')}
                isLoading={savingCustomer}
                error={customerError}
              />
            </div>
          </div>
        )}

        {/* Mobile Order Detail View - Full screen on mobile */}
        {mobileView === 'order-detail' && selectedOrderId && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('history')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <FileText className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดออเดอร์</h2>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <OrderForm
                key={`mobile-${selectedOrderId}`}
                editOrderId={selectedOrderId}
                embedded={true}
                onSuccess={(orderId) => {
                  setMobileView('history');
                  showToast('บันทึกการแก้ไขสำเร็จ!');
                  if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id);
                }}
                onCancel={() => setMobileView('history')}
              />
            </div>
          </div>
        )}

        {/* Order Panel - Right Side (Desktop only) */}
        {rightPanel === 'order' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-[#F4511E]" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedContact.customer.customer_code} - {selectedContact.customer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRightPanel(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <OrderForm
                preselectedCustomerId={selectedContact.customer.id}
                embedded={true}
                onSuccess={(orderId) => {
                  setRightPanel(null);
                  showToast('สร้างคำสั่งซื้อสำเร็จ!');
                }}
                onSendBillToChat={sendBillToCustomer}
                onCancel={() => setRightPanel(null)}
              />
            </div>
          </div>
        )}

        {/* Order History Panel - Right Side (Desktop only) */}
        {rightPanel === 'history' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedContact.customer.customer_code} - {selectedContact.customer.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRightPanel(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order History List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : orderHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>ยังไม่มีประวัติออเดอร์</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orderHistory.map((order) => {
                    const orderStatus = order.order_status || order.status;
                    return (
                      <div
                        key={order.id}
                        className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-blue-300 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          if (window.innerWidth < 768) {
                            setMobileView('order-detail');
                          } else {
                            setRightPanel('order-detail');
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{order.order_number}</span>
                            {order.order_date && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                เปิดบิล {new Date(order.created_at || order.order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {order.created_at && new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            orderStatus === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            orderStatus === 'new' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            orderStatus === 'shipping' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                            orderStatus === 'cancelled' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'
                          }`}>
                            {orderStatus === 'completed' ? 'เสร็จสิ้น' :
                             orderStatus === 'new' ? 'ใหม่' :
                             orderStatus === 'shipping' ? 'กำลังส่ง' :
                             orderStatus === 'cancelled' ? 'ยกเลิก' :
                             orderStatus}
                          </span>
                        </div>
                        {order.branch_names && order.branch_names.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {order.branch_names.map((name: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-sm text-gray-500 dark:text-slate-400">
                          <div className="flex items-center justify-between">
                            <span>
                              {order.delivery_date
                                ? `จัดส่ง ${new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
                                : 'ยังไม่กำหนดจัดส่ง'}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">฿{formatPrice(order.total_amount)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Customer Profile Panel - Right Side (Desktop only) */}
        {rightPanel === 'profile' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลลูกค้า</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {selectedContact.customer.customer_code}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenEditCustomer}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  แก้ไข
                </button>
                <button
                  onClick={() => setRightPanel(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="ปิด"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Customer Info */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
                {/* Header with picture */}
                <div className="text-center pb-4 border-b border-gray-100 dark:border-slate-700">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                    <User className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedContact.customer.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>
                  <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedContact.customer.customer_type === 'retail' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                    selectedContact.customer.customer_type === 'wholesale' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' :
                    'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                  }`}>
                    {selectedContact.customer.customer_type === 'retail' ? 'ขายปลีก' :
                     selectedContact.customer.customer_type === 'wholesale' ? 'ขายส่ง' : 'ตัวแทนจำหน่าย'}
                  </span>
                </div>

                {/* Contact info */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400">LINE</label>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" />
                      {selectedContact.display_name}
                    </p>
                  </div>

                  {selectedContact.customer.contact_person && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">ผู้ติดต่อ</label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.contact_person}</p>
                    </div>
                  )}

                  {selectedContact.customer.phone && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">เบอร์โทร</label>
                      <a
                        href={`tel:${selectedContact.customer.phone}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {selectedContact.customer.phone}
                      </a>
                    </div>
                  )}

                  {selectedContact.customer.email && (
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400">อีเมล</label>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.email}</p>
                    </div>
                  )}
                </div>

                {/* Address */}
                {(selectedContact.customer.address || selectedContact.customer.province) && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">ที่อยู่ออกบิล</label>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {[
                        selectedContact.customer.address,
                        selectedContact.customer.district,
                        selectedContact.customer.amphoe,
                        selectedContact.customer.province,
                        selectedContact.customer.postal_code
                      ].filter(Boolean).join(' ')}
                    </p>
                  </div>
                )}

                {/* Tax info */}
                {selectedContact.customer.tax_id && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">ข้อมูลใบกำกับภาษี</label>
                    {selectedContact.customer.tax_company_name && (
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.tax_company_name}</p>
                    )}
                    <p className="text-sm text-gray-600 dark:text-slate-400">เลขผู้เสียภาษี: {selectedContact.customer.tax_id}</p>
                    {selectedContact.customer.tax_branch && (
                      <p className="text-sm text-gray-600 dark:text-slate-400">สาขา: {selectedContact.customer.tax_branch}</p>
                    )}
                  </div>
                )}

                {/* Credit info */}
                {(selectedContact.customer.credit_limit || selectedContact.customer.credit_days) ? (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">เงื่อนไขเครดิต</label>
                    <div className="flex gap-4 mt-1">
                      {selectedContact.customer.credit_limit ? (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-slate-400">วงเงิน</span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">฿{formatPrice(selectedContact.customer.credit_limit)}</p>
                        </div>
                      ) : null}
                      {selectedContact.customer.credit_days ? (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-slate-400">ระยะเวลา</span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedContact.customer.credit_days} วัน</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* Notes */}
                {selectedContact.customer.notes && (
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                    <label className="text-xs text-gray-500 dark:text-slate-400">หมายเหตุ</label>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedContact.customer.notes}</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="pt-4 border-t border-gray-100 dark:border-slate-700 space-y-2">
                  <button
                    onClick={() => setRightPanel('order')}
                    className="w-full py-2 bg-[#F4511E] text-white rounded-lg font-medium hover:bg-[#D63B0E] transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    เปิดบิล
                  </button>
                  <button
                    onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')}
                    className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    ดูรายละเอียดเต็ม
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Customer Panel - Right Side (Desktop only) */}
        {rightPanel === 'edit-customer' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p>
                </div>
              </div>
              <button
                onClick={() => setRightPanel('profile')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit Customer Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <CustomerForm
                compact={true}
                initialData={{
                  name: selectedContact.customer.name || '',
                  contact_person: selectedContact.customer.contact_person || '',
                  phone: selectedContact.customer.phone || '',
                  email: selectedContact.customer.email || '',
                  customer_type: selectedContact.customer.customer_type || 'retail',
                  credit_limit: selectedContact.customer.credit_limit || 0,
                  credit_days: selectedContact.customer.credit_days || 0,
                  is_active: selectedContact.customer.is_active ?? true,
                  notes: selectedContact.customer.notes || '',
                  needs_tax_invoice: !!selectedContact.customer.tax_id,
                  tax_id: selectedContact.customer.tax_id || '',
                  tax_company_name: selectedContact.customer.tax_company_name || '',
                  tax_branch: selectedContact.customer.tax_branch || 'สำนักงานใหญ่',
                  billing_address: selectedContact.customer.address || '',
                  billing_district: selectedContact.customer.district || '',
                  billing_amphoe: selectedContact.customer.amphoe || '',
                  billing_province: selectedContact.customer.province || '',
                  billing_postal_code: selectedContact.customer.postal_code || '',
                  billing_same_as_shipping: false
                }}
                onSubmit={handleUpdateCustomerInChat}
                onCancel={() => setRightPanel('profile')}
                isEditing={true}
                isLoading={editingCustomer}
                error={editCustomerError}
              />
            </div>
          </div>
        )}

        {/* Create Customer Panel - Right Side (Desktop only) */}
        {rightPanel === 'create-customer' && selectedContact && !selectedContact.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้างลูกค้าใหม่</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">LINE: {selectedContact.display_name}</p>
                </div>
              </div>
              <button
                onClick={() => setRightPanel(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create Customer Form */}
            <div className="flex-1 overflow-y-auto p-4">
              <CustomerForm
                compact={true}
                lineDisplayName={selectedContact.display_name}
                onSubmit={handleCreateCustomer}
                onCancel={() => setRightPanel(null)}
                isLoading={savingCustomer}
                error={customerError}
              />
            </div>
          </div>
        )}
        {/* Order Detail Panel - Right Side (Desktop only) */}
        {rightPanel === 'order-detail' && selectedOrderId && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setRightPanel('history')}
                  className="p-1 -ml-1 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <FileText className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดออเดอร์</h2>
              </div>
              <button
                onClick={() => setRightPanel(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Order Form (edit if new, read-only otherwise) */}
            <div className="flex-1 overflow-y-auto p-4">
              <OrderForm
                key={selectedOrderId}
                editOrderId={selectedOrderId}
                embedded={true}
                onSuccess={(orderId) => {
                  setRightPanel('history');
                  showToast('บันทึกการแก้ไขสำเร็จ!');
                  if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id);
                }}
                onCancel={() => setRightPanel('history')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Link Customer Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4 shadow-xl">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">เชื่อมกับลูกค้าในระบบ</h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    if (e.target.value.length >= 2) {
                      fetchCustomers(e.target.value);
                    }
                  }}
                  placeholder="ค้นหาชื่อหรือรหัสลูกค้า..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                />
              </div>

              <div className="max-h-64 overflow-y-auto">
                {loadingCustomers ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                ) : customers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    {customerSearch.length >= 2 ? 'ไม่พบลูกค้า' : 'พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => linkCustomer(customer.id)}
                        className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">{customer.customer_code}</div>
                          <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                          {customer.phone && (
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                        <Check className="w-5 h-5 text-[#06C755]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedContact?.customer && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => linkCustomer(null)}
                    className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                  >
                    ยกเลิกการเชื่อมกับลูกค้า
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Gallery Overlay */}
      {(lightboxIndex !== null || showGallery) && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => { setLightboxIndex(null); setShowGallery(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (showGallery && lightboxIndex !== null) { setShowGallery(false); }
              else { setLightboxIndex(null); setShowGallery(false); }
            }
            if (!showGallery && lightboxIndex !== null) {
              if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
              if (e.key === 'ArrowRight' && lightboxIndex < mediaList.length - 1) setLightboxIndex(lightboxIndex + 1);
            }
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
            <span className="text-white/70 text-sm">
              {showGallery ? `แกลเลอรี่ (${mediaList.length})` : lightboxIndex !== null ? `${lightboxIndex + 1} / ${mediaList.length}` : ''}
            </span>
            <div className="flex items-center gap-2">
              {!showGallery && lightboxMedia && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch(lightboxMedia.url);
                      const blob = await res.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      const ext = lightboxMedia.type === 'video' ? 'mp4' : 'jpg';
                      a.download = `chat-${Date.now()}.${ext}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(blobUrl);
                    } catch {
                      window.open(lightboxMedia.url, '_blank');
                    }
                  }}
                  className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white"
                  title="บันทึก"
                >
                  <Download className="w-5 h-5" />
                </button>
              )}
              {mediaList.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowGallery(!showGallery); }}
                  className={`p-2.5 rounded-full transition-colors text-white ${showGallery ? 'bg-white/40' : 'bg-white/20 hover:bg-white/30'}`}
                  title="แกลเลอรี่"
                >
                  <Images className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => { setLightboxIndex(null); setShowGallery(false); }}
                className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white"
                title="ปิด"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {showGallery ? (
            /* Gallery Grid View */
            <div className="max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 mt-14" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-3 gap-2">
                {mediaList.map((media, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setShowGallery(false); setLightboxIndex(idx); }}
                    className={`relative aspect-square rounded-lg overflow-hidden bg-gray-800 hover:opacity-80 transition-opacity ${lightboxIndex === idx ? 'ring-2 ring-white' : ''}`}
                  >
                    {media.type === 'image' ? (
                      <img src={media.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                          <Play className="w-8 h-8 text-white/80" />
                        </div>
                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">VDO</div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : lightboxMedia && lightboxIndex !== null ? (
            <>
              {/* Previous arrow */}
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                disabled={lightboxIndex <= 0}
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10"
                title="รูปก่อนหน้า"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Next arrow */}
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                disabled={lightboxIndex >= mediaList.length - 1}
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10"
                title="รูปถัดไป"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Content */}
              <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {lightboxMedia.type === 'image' ? (
                  <img
                    src={lightboxMedia.url}
                    alt="Full size"
                    className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
                    draggable={false}
                  />
                ) : (
                  <video
                    key={lightboxMedia.url}
                    src={lightboxMedia.url}
                    controls
                    autoPlay
                    className="max-w-full max-h-[85vh] rounded-lg"
                  >
                    เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ
                  </video>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

    </Layout>
  );
}

export default function LineChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    }>
      <LineChatPageContent />
    </Suspense>
  );
}
