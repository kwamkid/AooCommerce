'use client';

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import {
  MessageCircle,
  Facebook,
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

interface UnifiedContact {
  id: string;
  platform: 'line' | 'facebook';
  platform_user_id: string;
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
  last_message?: string;
  last_order_date?: string;
  last_order_created_at?: string;
  avg_order_frequency?: number | null;
  account_name?: string;
  account_picture_url?: string;
  chat_account_id?: string;
}

interface ChatMessage {
  id: string;
  contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  content: string;
  sent_by?: string;
  sent_by_user?: {
    id: string;
    name: string;
  };
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
    lineMessageId?: string;
    imageUrl?: string;
    videoUrl?: string;
    previewUrl?: string;
    contentProvider?: {
      originalContentUrl?: string;
      previewImageUrl?: string;
    };
  };
  created_at: string;
  _status?: 'sending' | 'sent' | 'failed';
  _tempId?: string;
  // Allow platform-specific contact_id fields from realtime
  line_contact_id?: string;
  fb_contact_id?: string;
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

interface ChatAccountInfo {
  id: string;
  platform: string;
  account_name: string;
  is_active: boolean;
}

// Helper: get avatar URL — fallback to FB Graph avatar for FB contacts without picture
function getAvatarUrl(contact: UnifiedContact): string | null {
  if (contact.picture_url) return contact.picture_url;
  if (contact.platform === 'facebook' && contact.platform_user_id) {
    return `https://graph.facebook.com/${contact.platform_user_id}/picture?type=large`;
  }
  return null;
}

function UnifiedChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const contactsEndRef = useRef<HTMLDivElement>(null);

  // Chat accounts for filter
  const [chatAccounts, setChatAccounts] = useState<ChatAccountInfo[]>([]);
  const [filterAccountId, setFilterAccountId] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'line' | 'facebook'>('all');

  // Selected contact state
  const [selectedContact, setSelectedContact] = useState<UnifiedContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [filterOrderDaysRange, setFilterOrderDaysRange] = useState<{ min: number; max: number | null } | null>(null);

  // Day ranges from CRM settings
  const [dayRanges, setDayRanges] = useState<DayRange[]>([]);

  const hasActiveFilter = filterLinked !== 'all' || filterUnread || filterOrderDaysRange !== null;

  // Platform color
  const platformColor = selectedContact?.platform === 'line' ? '#06C755' : '#1877F2';

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

  // Fetch chat accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await apiFetch('/api/chat-accounts');
        if (res.ok) {
          const data = await res.json();
          setChatAccounts((data.accounts || []).filter((a: ChatAccountInfo) => a.is_active));
        }
      } catch {}
    };
    if (!authLoading && userProfile) fetchAccounts();
  }, [authLoading, userProfile]);

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
    if (!authLoading && userProfile) fetchSettings();
  }, [authLoading, userProfile]);

  // Fetch contacts
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchContacts();
    }
  }, [authLoading, userProfile, searchTerm, filterLinked, filterUnread, filterOrderDaysRange, filterAccountId, filterPlatform]);

  // Auto-select contact from URL param
  useEffect(() => {
    const contactId = searchParams.get('contact_id');
    if (contactId && contacts.length > 0 && !selectedContact) {
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        setSelectedContact(contact);
        router.replace('/chat', { scroll: false });
      }
    }
  }, [searchParams, contacts, selectedContact, router]);

  // Fetch messages when contact selected
  useEffect(() => {
    if (selectedContact) {
      fetchMessages(selectedContact.id);
      setMobileView('chat');
      setRightPanel(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollButton(distanceFromBottom > 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Sync rightPanel → mobileView when resizing
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

  // IntersectionObserver for infinite scroll on messages
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

  // Supabase Realtime - dual subscriptions for LINE + FB
  useEffect(() => {
    const handleNewMessage = (payload: any, contactIdField: string) => {
      const newMsg = payload.new as ChatMessage;
      const msgContactId = (newMsg as any)[contactIdField];

      if (selectedContact && msgContactId === selectedContact.id) {
        setMessages(prev => {
          const existsById = prev.some(m => m.id === newMsg.id);
          if (existsById) return prev;
          if (newMsg.direction === 'outgoing') {
            const alreadyHave = prev.some(m => m.content === newMsg.content && m.direction === 'outgoing');
            if (alreadyHave) return prev;
          }
          return [...prev, { ...newMsg, contact_id: msgContactId }];
        });

        if (newMsg.direction === 'incoming') {
          apiFetch(`/api/chat/messages?contact_id=${selectedContact.id}&platform=${selectedContact.platform}&limit=1`).catch(() => {});
        }
      }
      fetchContacts();
    };

    const lineMessagesChannel = supabase
      .channel('line_messages_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_messages' },
        (payload) => handleNewMessage(payload, 'line_contact_id'))
      .subscribe();

    const fbMessagesChannel = supabase
      .channel('fb_messages_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fb_messages' },
        (payload) => handleNewMessage(payload, 'fb_contact_id'))
      .subscribe();

    const lineContactsChannel = supabase
      .channel('line_contacts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'line_contacts' }, () => fetchContacts())
      .subscribe();

    const fbContactsChannel = supabase
      .channel('fb_contacts_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fb_contacts' }, () => fetchContacts())
      .subscribe();

    return () => {
      supabase.removeChannel(lineMessagesChannel);
      supabase.removeChannel(fbMessagesChannel);
      supabase.removeChannel(lineContactsChannel);
      supabase.removeChannel(fbContactsChannel);
    };
  }, [selectedContact]);

  const fetchContacts = async (loadMore = false) => {
    try {
      if (loadMore) setLoadingMoreContacts(true);
      const params = new URLSearchParams();
      if (filterAccountId) params.set('account_id', filterAccountId);
      else if (filterPlatform !== 'all') params.set('platform', filterPlatform);
      if (searchTerm) params.set('search', searchTerm);
      if (filterUnread) params.set('unread_only', 'true');
      if (filterLinked === 'linked') params.set('linked_only', 'true');
      if (filterLinked === 'unlinked') params.set('unlinked_only', 'true');
      if (filterOrderDaysRange) {
        params.set('order_days_min', filterOrderDaysRange.min.toString());
        if (filterOrderDaysRange.max !== null) params.set('order_days_max', filterOrderDaysRange.max.toString());
      }
      params.set('limit', '30');
      params.set('offset', loadMore ? contacts.length.toString() : '0');

      const response = await apiFetch(`/api/chat/contacts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contacts');

      const result = await response.json();
      let contactsList = result.contacts || [];

      if (selectedContact) {
        contactsList = contactsList.map((c: UnifiedContact) =>
          c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
        );
      }

      if (loadMore) {
        setContacts(prev => [...prev, ...contactsList]);
      } else {
        setContacts(contactsList);
      }

      setHasMoreContacts(result.summary?.hasMore || false);

      if (loadMore) {
        setTotalUnread(prev => prev + contactsList.reduce((sum: number, c: UnifiedContact) => sum + c.unread_count, 0));
      } else {
        setTotalUnread(contactsList.reduce((sum: number, c: UnifiedContact) => sum + c.unread_count, 0));
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoadingContacts(false);
      setLoadingMoreContacts(false);
    }
  };

  const fetchMessages = async (contactId: string, loadMore = false) => {
    if (!selectedContact) return;
    try {
      if (loadMore) setLoadingMore(true);
      else setLoadingMessages(true);
      const offset = loadMore ? messages.length : 0;
      const limit = 50;
      const response = await apiFetch(`/api/chat/messages?contact_id=${contactId}&platform=${selectedContact.platform}&limit=${limit}&offset=${offset}`);
      if (!response.ok) throw new Error('Failed to fetch messages');

      const result = await response.json();
      const newMessages = result.messages || [];

      if (loadMore) {
        const container = messagesContainerRef.current;
        const prevScrollHeight = container?.scrollHeight || 0;
        setMessages(prev => [...newMessages, ...prev]);
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setMessages(newMessages);
      }

      setHasMoreMessages(newMessages.length === limit);
      if (!loadMore) {
        setContacts(prev => prev.map(c => c.id === contactId ? { ...c, unread_count: 0 } : c));
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
      setLoadingMore(false);
    }
  };

  const sendBillToCustomer = async (orderId: string, orderNumber: string, billUrl: string) => {
    if (!selectedContact) return;
    const messageText = `สรุปคำสั่งซื้อ ${orderNumber}\n\nดูรายละเอียดและชำระเงินได้ที่:\n${billUrl}`;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'text', content: messageText,
      created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setMobileView('chat');
    setRightPanel(null);

    const contactId = selectedContact.id;
    const platform = selectedContact.platform;
    try {
      const response = await apiFetch('/api/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, message: messageText })
      });
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      if (result.message) {
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
      }
      showToast('ส่งบิลให้ลูกค้าสำเร็จ!');
    } catch {
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const } : m));
      showToast('ส่งบิลไม่สำเร็จ', 'error');
    }
  };

  const sendMessage = (retryMessage?: ChatMessage) => {
    const messageText = retryMessage?.content || newMessage.trim();
    if (!messageText || !selectedContact) return;
    const tempId = retryMessage?._tempId || `temp-${Date.now()}`;

    if (!retryMessage) {
      const optimisticMessage: ChatMessage = {
        id: tempId, _tempId: tempId, contact_id: selectedContact.id,
        direction: 'outgoing', message_type: 'text', content: messageText,
        created_at: new Date().toISOString(), _status: 'sending'
      };
      setMessages(prev => [...prev, optimisticMessage]);
      setNewMessage('');
      inputRef.current?.focus();
    } else {
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'sending' as const } : m));
    }

    const contactId = selectedContact.id;
    const platform = selectedContact.platform;
    (async () => {
      try {
        const response = await apiFetch('/api/chat/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contactId, platform, message: messageText })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
        }
      } catch (error) {
        console.error('Error sending message:', error);
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const } : m));
      }
    })();
  };

  const compressImage = (file: File, maxSizeKB = 500): Promise<Blob> => {
    return new Promise((resolve) => {
      if (file.size <= maxSizeKB * 1024) { resolve(file); return; }
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1920;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) { resolve(blob); }
            else { quality -= 0.1; tryCompress(); }
          }, 'image/jpeg', quality);
        };
        tryCompress();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact) return;
    if (!file.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพ', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)', 'error'); return; }

    const compressed = await compressImage(file);
    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(compressed);
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'image', content: '[รูปภาพ]',
      raw_message: { imageUrl: localUrl }, created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setUploadingImage(true);
    const contactId = selectedContact.id;
    const platform = selectedContact.platform;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      const fileName = `admin-images/${Date.now()}-${file.name.replace(/\.[^.]+$/, '.jpg')}`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(fileName, compressed, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;

      const response = await apiFetch('/api/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, type: 'image', imageUrl })
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }
      const result = await response.json();
      if (result.message) {
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
      }
      URL.revokeObjectURL(localUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const } : m));
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendSticker = (packageId: string, stickerId: string) => {
    if (!selectedContact) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId, _tempId: tempId, contact_id: selectedContact.id,
      direction: 'outgoing', message_type: 'sticker', content: '[สติกเกอร์]',
      raw_message: { packageId, stickerId }, created_at: new Date().toISOString(), _status: 'sending'
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setShowStickerPicker(false);
    const contactId = selectedContact.id;

    (async () => {
      try {
        const response = await apiFetch('/api/chat/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contactId, platform: 'line', type: 'sticker', packageId, stickerId })
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.map(m => m._tempId === tempId ? { ...result.message, contact_id: contactId, _status: 'sent' as const } : m));
        }
      } catch (error) {
        console.error('Error sending sticker:', error);
        setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'failed' as const } : m));
      }
    })();
  };

  const officialStickers = [
    { packageId: '1', stickers: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17'] },
    { packageId: '2', stickers: ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32'] },
    { packageId: '3', stickers: ['180','181','182','183','184','185','186','187','188','189','190','191','192','193','194','195'] },
  ];

  const fetchCustomers = async (search: string) => {
    try {
      setLoadingCustomers(true);
      const response = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}&limit=10`);
      if (!response.ok) throw new Error('Failed');
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
      const response = await apiFetch('/api/chat/contacts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, platform: selectedContact.platform, customer_id: customerId })
      });
      if (!response.ok) throw new Error('Failed');
      const linkedCustomer = customers.find(c => c.id === customerId);
      setSelectedContact(prev => prev ? {
        ...prev, customer_id: customerId || undefined,
        customer: linkedCustomer ? { id: linkedCustomer.id, name: linkedCustomer.name, customer_code: linkedCustomer.customer_code } : undefined
      } : null);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? {
        ...c, customer_id: customerId || undefined,
        customer: linkedCustomer ? { id: linkedCustomer.id, name: linkedCustomer.name, customer_code: linkedCustomer.customer_code } : undefined
      } : c));
      setShowLinkModal(false);
    } catch (error) {
      console.error('Error linking customer:', error);
    }
  };

  const handleCreateCustomer = async (formData: CustomerFormData) => {
    if (!selectedContact) return;
    setSavingCustomer(true);
    setCustomerError('');
    try {
      const billingAddress = formData.billing_same_as_shipping ? formData.shipping_address : formData.billing_address;
      const billingDistrict = formData.billing_same_as_shipping ? formData.shipping_district : formData.billing_district;
      const billingAmphoe = formData.billing_same_as_shipping ? formData.shipping_amphoe : formData.billing_amphoe;
      const billingProvince = formData.billing_same_as_shipping ? formData.shipping_province : formData.billing_province;
      const billingPostalCode = formData.billing_same_as_shipping ? formData.shipping_postal_code : formData.billing_postal_code;

      const customerPayload = {
        name: formData.name, contact_person: formData.contact_person, phone: formData.phone,
        email: formData.email, customer_type: formData.customer_type, credit_limit: formData.credit_limit,
        credit_days: formData.credit_days, is_active: formData.is_active, notes: formData.notes,
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        address: billingAddress, district: billingDistrict, amphoe: billingAmphoe,
        province: billingProvince, postal_code: billingPostalCode
      };

      const createResponse = await apiFetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customerPayload)
      });
      if (!createResponse.ok) { const error = await createResponse.json(); throw new Error(error.error || 'Failed'); }
      const newCustomer = await createResponse.json();

      if (formData.shipping_address || formData.shipping_province) {
        const shippingPayload = {
          customer_id: newCustomer.id, address_name: formData.shipping_address_name || 'สาขาหลัก',
          contact_person: formData.shipping_contact_person || formData.contact_person,
          phone: formData.shipping_phone || formData.phone, address_line1: formData.shipping_address,
          district: formData.shipping_district, amphoe: formData.shipping_amphoe,
          province: formData.shipping_province, postal_code: formData.shipping_postal_code,
          google_maps_link: formData.shipping_google_maps_link, delivery_notes: formData.shipping_delivery_notes,
          is_default: true
        };
        await apiFetch('/api/shipping-addresses', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shippingPayload)
        });
      }

      const linkResponse = await apiFetch('/api/chat/contacts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, platform: selectedContact.platform, customer_id: newCustomer.id })
      });
      if (!linkResponse.ok) throw new Error('Failed to link customer');

      setSelectedContact(prev => prev ? {
        ...prev, customer_id: newCustomer.id,
        customer: { id: newCustomer.id, name: newCustomer.name, customer_code: newCustomer.customer_code }
      } : null);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? {
        ...c, customer_id: newCustomer.id,
        customer: { id: newCustomer.id, name: newCustomer.name, customer_code: newCustomer.customer_code }
      } : c));
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

  const handleOpenCreateCustomer = () => {
    setCustomerError('');
    if (window.innerWidth < 768) setMobileView('create-customer');
    else setRightPanel('create-customer');
  };

  const handleOpenEditCustomer = () => {
    setEditCustomerError('');
    if (window.innerWidth < 768) setMobileView('edit-customer');
    else setRightPanel('edit-customer');
  };

  const handleUpdateCustomerInChat = async (formData: CustomerFormData) => {
    if (!selectedContact?.customer) return;
    setEditingCustomer(true);
    setEditCustomerError('');
    try {
      const billingAddress = formData.billing_same_as_shipping ? formData.shipping_address : formData.billing_address;
      const billingDistrict = formData.billing_same_as_shipping ? formData.shipping_district : formData.billing_district;
      const billingAmphoe = formData.billing_same_as_shipping ? formData.shipping_amphoe : formData.billing_amphoe;
      const billingProvince = formData.billing_same_as_shipping ? formData.shipping_province : formData.billing_province;
      const billingPostalCode = formData.billing_same_as_shipping ? formData.shipping_postal_code : formData.billing_postal_code;

      const payload = {
        id: selectedContact.customer.id, name: formData.name, contact_person: formData.contact_person,
        phone: formData.phone, email: formData.email, customer_type: formData.customer_type,
        credit_limit: formData.credit_limit, credit_days: formData.credit_days, is_active: formData.is_active,
        notes: formData.notes,
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        address: billingAddress, district: billingDistrict, amphoe: billingAmphoe,
        province: billingProvince, postal_code: billingPostalCode
      };

      const response = await apiFetch('/api/customers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed'); }

      const updatedCustomer = {
        ...selectedContact.customer, name: formData.name, contact_person: formData.contact_person,
        phone: formData.phone, email: formData.email,
        customer_type: formData.customer_type as 'retail' | 'wholesale' | 'distributor',
        address: billingAddress, district: billingDistrict, amphoe: billingAmphoe,
        province: billingProvince, postal_code: billingPostalCode,
        tax_id: formData.needs_tax_invoice ? formData.tax_id : '',
        tax_company_name: formData.needs_tax_invoice ? formData.tax_company_name : '',
        tax_branch: formData.needs_tax_invoice ? formData.tax_branch : '',
        credit_limit: formData.credit_limit, credit_days: formData.credit_days,
        notes: formData.notes, is_active: formData.is_active
      };
      setSelectedContact(prev => prev ? { ...prev, customer: updatedCustomer } : null);
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, customer: updatedCustomer } : c));
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
    if (isToday) return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
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

  const fetchOrderHistory = async (customerId: string) => {
    try {
      setLoadingHistory(true);
      const response = await apiFetch(`/api/orders?customer_id=${customerId}&limit=20`);
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      setOrderHistory(result.orders || []);
    } catch (error) {
      console.error('Error fetching order history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    if (!selectedContact?.customer) return;
    if (window.innerWidth < 768) setMobileView('history');
    else setRightPanel(rightPanel === 'history' ? null : 'history');
    fetchOrderHistory(selectedContact.customer.id);
  };

  const handleOpenProfile = () => {
    if (!selectedContact?.customer) return;
    if (window.innerWidth < 768) setMobileView('profile');
    else setRightPanel(rightPanel === 'profile' ? null : 'profile');
  };

  if (authLoading) {
    return (<Layout><div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" /></div></Layout>);
  }

  // Helper to render order card (used in both mobile and desktop history)
  const renderOrderCard = (order: any) => {
    const orderStatus = order.order_status || order.status;
    return (
      <div key={order.id} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-blue-300 transition-colors cursor-pointer"
        onClick={() => { setSelectedOrderId(order.id); if (window.innerWidth < 768) setMobileView('order-detail'); else setRightPanel('order-detail'); }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="font-medium text-gray-900 dark:text-white">{order.order_number}</span>
            {order.order_date && (<p className="text-xs text-gray-400 mt-0.5">เปิดบิล {new Date(order.created_at || order.order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {order.created_at && new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>)}
          </div>
          <span className={`px-2 py-0.5 text-xs rounded-full ${orderStatus === 'completed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : orderStatus === 'new' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : orderStatus === 'shipping' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : orderStatus === 'cancelled' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300'}`}>
            {orderStatus === 'completed' ? 'เสร็จสิ้น' : orderStatus === 'new' ? 'ใหม่' : orderStatus === 'shipping' ? 'กำลังส่ง' : orderStatus === 'cancelled' ? 'ยกเลิก' : orderStatus}
          </span>
        </div>
        {order.branch_names && order.branch_names.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">{order.branch_names.map((name: string, idx: number) => (<span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{name}</span>))}</div>
        )}
        <div className="text-sm text-gray-500 dark:text-slate-400">
          <div className="flex items-center justify-between">
            <span>{order.delivery_date ? `จัดส่ง ${new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}` : 'ยังไม่กำหนดจัดส่ง'}</span>
            <span className="font-medium text-gray-900 dark:text-white">฿{order.total_amount?.toLocaleString('th-TH', { minimumFractionDigits: 2 }) || '0.00'}</span>
          </div>
        </div>
      </div>
    );
  };

  // Helper to render customer profile content
  const renderCustomerProfile = () => {
    if (!selectedContact?.customer) return null;
    const c = selectedContact.customer;
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-4">
        <div className="text-center pb-4 border-b border-gray-100 dark:border-slate-700">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3"><User className="w-8 h-8 text-blue-500" /></div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{c.name}</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">{c.customer_code}</p>
          <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.customer_type === 'retail' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' : c.customer_type === 'wholesale' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'}`}>
            {c.customer_type === 'retail' ? 'ขายปลีก' : c.customer_type === 'wholesale' ? 'ขายส่ง' : 'ตัวแทนจำหน่าย'}
          </span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.platform === 'line' ? 'LINE' : 'Facebook'}</label>
            <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
              {selectedContact.platform === 'line' ? <MessageCircle className="w-3.5 h-3.5 text-[#06C755]" /> : <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />}
              {selectedContact.display_name}
            </p>
          </div>
          {c.contact_person && (<div><label className="text-xs text-gray-500 dark:text-slate-400">ผู้ติดต่อ</label><p className="text-sm font-medium text-gray-900 dark:text-white">{c.contact_person}</p></div>)}
          {c.phone && (<div><label className="text-xs text-gray-500 dark:text-slate-400">เบอร์โทร</label><a href={`tel:${c.phone}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{c.phone}</a></div>)}
          {c.email && (<div><label className="text-xs text-gray-500 dark:text-slate-400">อีเมล</label><p className="text-sm font-medium text-gray-900 dark:text-white">{c.email}</p></div>)}
        </div>
        {(c.address || c.province) && (<div className="pt-3 border-t border-gray-100 dark:border-slate-700"><label className="text-xs text-gray-500 dark:text-slate-400">ที่อยู่ออกบิล</label><p className="text-sm text-gray-900 dark:text-white">{[c.address, c.district, c.amphoe, c.province, c.postal_code].filter(Boolean).join(' ')}</p></div>)}
        {c.tax_id && (<div className="pt-3 border-t border-gray-100 dark:border-slate-700"><label className="text-xs text-gray-500 dark:text-slate-400">ข้อมูลใบกำกับภาษี</label>{c.tax_company_name && <p className="text-sm font-medium text-gray-900 dark:text-white">{c.tax_company_name}</p>}<p className="text-sm text-gray-600 dark:text-slate-400">เลขผู้เสียภาษี: {c.tax_id}</p>{c.tax_branch && <p className="text-sm text-gray-600 dark:text-slate-400">สาขา: {c.tax_branch}</p>}</div>)}
        {(c.credit_limit || c.credit_days) ? (<div className="pt-3 border-t border-gray-100 dark:border-slate-700"><label className="text-xs text-gray-500 dark:text-slate-400">เงื่อนไขเครดิต</label><div className="flex gap-4 mt-1">{c.credit_limit ? <div><span className="text-xs text-gray-500 dark:text-slate-400">วงเงิน</span><p className="text-sm font-medium text-gray-900 dark:text-white">฿{c.credit_limit.toLocaleString()}</p></div> : null}{c.credit_days ? <div><span className="text-xs text-gray-500 dark:text-slate-400">ระยะเวลา</span><p className="text-sm font-medium text-gray-900 dark:text-white">{c.credit_days} วัน</p></div> : null}</div></div>) : null}
        {c.notes && (<div className="pt-3 border-t border-gray-100 dark:border-slate-700"><label className="text-xs text-gray-500 dark:text-slate-400">หมายเหตุ</label><p className="text-sm text-gray-900 whitespace-pre-wrap">{c.notes}</p></div>)}
      </div>
    );
  };

  // Helper: edit customer form initial data
  const editCustomerInitialData = selectedContact?.customer ? {
    name: selectedContact.customer.name || '', contact_person: selectedContact.customer.contact_person || '',
    phone: selectedContact.customer.phone || '', email: selectedContact.customer.email || '',
    customer_type: selectedContact.customer.customer_type || 'retail',
    credit_limit: selectedContact.customer.credit_limit || 0, credit_days: selectedContact.customer.credit_days || 0,
    is_active: selectedContact.customer.is_active ?? true, notes: selectedContact.customer.notes || '',
    needs_tax_invoice: !!selectedContact.customer.tax_id, tax_id: selectedContact.customer.tax_id || '',
    tax_company_name: selectedContact.customer.tax_company_name || '', tax_branch: selectedContact.customer.tax_branch || 'สำนักงานใหญ่',
    billing_address: selectedContact.customer.address || '', billing_district: selectedContact.customer.district || '',
    billing_amphoe: selectedContact.customer.amphoe || '', billing_province: selectedContact.customer.province || '',
    billing_postal_code: selectedContact.customer.postal_code || '', billing_same_as_shipping: false
  } : undefined;

  return (
    <Layout>
      <div className="flex h-[calc(100vh-120px)] bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Contacts Sidebar */}
        <div className={`w-full md:w-80 border-r border-gray-200 dark:border-slate-700 flex flex-col ${mobileView !== 'contacts' ? 'hidden md:flex' : 'flex'} ${rightPanel ? 'md:hidden xl:flex' : ''}`}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#F4511E]" />
                แชท
              </h2>
              {totalUnread > 0 && (<span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{totalUnread}</span>)}
            </div>
            {/* Account filter */}
            <select value={filterAccountId || filterPlatform} onChange={(e) => { const val = e.target.value; if (val === 'all' || val === 'line' || val === 'facebook') { setFilterPlatform(val as any); setFilterAccountId(''); } else { setFilterAccountId(val); setFilterPlatform('all'); } }}
              className="w-full px-3 py-2 mb-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F4511E]">
              <option value="all">ทุกช่องทาง</option>
              <option value="line">LINE ทั้งหมด</option>
              <option value="facebook">Facebook ทั้งหมด</option>
              {chatAccounts.map(acc => (<option key={acc.id} value={acc.id}>{acc.platform === 'line' ? '🟢' : '🔵'} {acc.account_name}</option>))}
            </select>
            {/* Quick filter - Order days */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button onClick={() => { setFilterOrderDaysRange(null); setFilterLinked('all'); }}
                className={`px-2 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 ${filterOrderDaysRange === null && filterLinked !== 'linked' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>ทั้งหมด</button>
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
                return (<button key={`${range.minDays}-${range.maxDays}`} onClick={() => { setFilterOrderDaysRange({ min: range.minDays, max: range.maxDays }); setFilterLinked('linked'); }}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors flex items-center gap-1 ${isActive ? colors.active : colors.inactive}`}><Clock className="w-3 h-3" />{range.label}</button>);
              })}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ค้นหาชื่อ..."
                  className="w-full h-[42px] pl-9 pr-4 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
              </div>
              <div className="relative h-[42px]" data-filter-popover>
                <button onClick={() => setShowFilterPopover(!showFilterPopover)}
                  className={`h-full w-[42px] flex items-center justify-center border rounded-lg transition-colors ${hasActiveFilter ? 'bg-[#F4511E] border-[#F4511E] text-white' : 'border-gray-300 dark:border-slate-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700'}`} title="กรองรายชื่อ">
                  <Filter className="w-5 h-5" />
                </button>
                {showFilterPopover && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                    <div className="p-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">กรองรายชื่อ</span>
                      {hasActiveFilter && (<button onClick={() => { setFilterLinked('all'); setFilterUnread(false); setFilterOrderDaysRange(null); }} className="text-xs text-red-500 hover:text-red-600">ล้างทั้งหมด</button>)}
                    </div>
                    <div className="p-3 space-y-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2 block">สถานะเชื่อมลูกค้า</label>
                        <div className="flex gap-2">
                          <button onClick={() => setFilterLinked('all')} className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="ทั้งหมด"><User className="w-4 h-4" /></button>
                          <button onClick={() => setFilterLinked('linked')} className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'linked' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="เชื่อมลูกค้าแล้ว"><UserCheck className="w-4 h-4" /></button>
                          <button onClick={() => { setFilterLinked('unlinked'); setFilterOrderDaysRange(null); }} className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors flex items-center justify-center gap-1 ${filterLinked === 'unlinked' ? 'bg-orange-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="ยังไม่เชื่อมลูกค้า"><UserX className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400 mb-2 block">ข้อความใหม่</label>
                        <button onClick={() => setFilterUnread(!filterUnread)} className={`px-3 py-2 rounded-lg transition-colors flex items-center justify-center ${filterUnread ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="เฉพาะข้อความที่ยังไม่อ่าน"><Bell className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="p-3 border-t border-gray-100 dark:border-slate-700">
                      <button onClick={() => setShowFilterPopover(false)} className="w-full px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">ปิด</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Active filters display */}
            {hasActiveFilter && (
              <div className="flex flex-wrap gap-1 mt-2">
                {filterLinked === 'linked' && !filterOrderDaysRange && (<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"><UserCheck className="w-3 h-3" />เชื่อมลูกค้าแล้ว<button onClick={() => setFilterLinked('all')} className="ml-1 hover:text-blue-900"><X className="w-3 h-3" /></button></span>)}
                {filterLinked === 'unlinked' && (<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full"><UserX className="w-3 h-3" />ยังไม่เชื่อมลูกค้า<button onClick={() => setFilterLinked('all')} className="ml-1 hover:text-orange-900"><X className="w-3 h-3" /></button></span>)}
                {filterUnread && (<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full"><Bell className="w-3 h-3" />ยังไม่อ่าน<button onClick={() => setFilterUnread(false)} className="ml-1 hover:text-red-900"><X className="w-3 h-3" /></button></span>)}
                {filterOrderDaysRange !== null && (<span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${filterOrderDaysRange.min >= 7 ? 'bg-red-100 text-red-700' : filterOrderDaysRange.min >= 5 ? 'bg-orange-100 text-orange-700' : filterOrderDaysRange.min >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'}`}><Clock className="w-3 h-3" />ไม่สั่ง {filterOrderDaysRange.max === null ? `${filterOrderDaysRange.min}+ วัน` : `${filterOrderDaysRange.min}-${filterOrderDaysRange.max} วัน`}<button onClick={() => { setFilterOrderDaysRange(null); setFilterLinked('all'); }} className="ml-1 hover:opacity-70"><X className="w-3 h-3" /></button></span>)}
              </div>
            )}
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-slate-400"><MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีข้อความ</p></div>
            ) : (
              <>
                {contacts.map((contact) => (
                  <button key={contact.id} onClick={() => setSelectedContact(contact)}
                    className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700 ${selectedContact?.id === contact.id ? (contact.platform === 'line' ? 'bg-[#06C755]/10' : 'bg-[#1877F2]/10') : ''}`}>
                    {/* Avatar with platform badge */}
                    <div className="relative flex-shrink-0">
                      {getAvatarUrl(contact) ? (
                        <Image src={getAvatarUrl(contact)!} alt={contact.display_name} width={48} height={48} className="w-12 h-12 rounded-full object-cover" unoptimized />
                      ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: contact.platform === 'line' ? '#06C755' : '#1877F2' }}>
                          <User className="w-6 h-6 text-white" />
                        </div>
                      )}
                      {contact.unread_count > 0 && (<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{contact.unread_count > 9 ? '9+' : contact.unread_count}</span>)}
                      {/* Platform badge */}
                      <span className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white dark:border-slate-800 ${contact.platform === 'line' ? 'bg-[#06C755]' : 'bg-[#1877F2]'}`}>
                        {contact.platform === 'line' ? <MessageCircle className="w-2.5 h-2.5 text-white" /> : <Facebook className="w-2.5 h-2.5 text-white" />}
                      </span>
                      {/* Linked customer indicator */}
                      {contact.customer && (<span className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white w-4 h-4 rounded-full flex items-center justify-center shadow-sm border border-white dark:border-slate-800"><LinkIcon className="w-2.5 h-2.5" /></span>)}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-white truncate">{contact.display_name}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{formatLastMessage(contact.last_message_at)}</span>
                      </div>
                      {contact.account_name && (<span className="text-[10px] text-gray-400 dark:text-slate-500 truncate block">{contact.account_name}</span>)}
                      {contact.last_message ? (
                        <div className="text-xs text-gray-500 truncate">{contact.last_message}</div>
                      ) : contact.customer ? (
                        <div className="text-xs truncate flex items-center gap-1" style={{ color: contact.platform === 'line' ? '#06C755' : '#1877F2' }}>
                          <LinkIcon className="w-3 h-3" />{contact.customer.customer_code} - {contact.customer.name}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-slate-500">ยังไม่มีข้อความ</div>
                      )}
                      {filterLinked === 'linked' && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {contact.last_order_date ? `สั่งล่าสุด: ${new Date(contact.last_order_created_at || contact.last_order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}${contact.last_order_created_at ? ' ' + new Date(contact.last_order_created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'ยังไม่เคยสั่ง'}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                <div ref={contactsEndRef} className="py-2">
                  {loadingMoreContacts && (<div className="flex items-center justify-center py-2"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-col relative ${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} ${rightPanel ? 'w-full md:w-[340px] xl:w-[420px]' : 'flex-1'}`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between min-h-[81px]">
                <div className="flex items-center gap-3">
                  <button onClick={() => { setSelectedContact(null); setMobileView('contacts'); }} className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button>
                  {getAvatarUrl(selectedContact) ? (
                    <Image src={getAvatarUrl(selectedContact)!} alt={selectedContact.display_name} width={40} height={40} className="w-10 h-10 rounded-full object-cover" unoptimized />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: platformColor }}><User className="w-5 h-5 text-white" /></div>
                  )}
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                      {selectedContact.platform === 'line' ? <MessageCircle className="w-4 h-4 text-[#06C755] flex-shrink-0" /> : <Facebook className="w-4 h-4 text-[#1877F2] flex-shrink-0" />}
                      {selectedContact.display_name}
                    </h3>
                    {selectedContact.account_name && (<p className="text-[10px] text-gray-400">{selectedContact.account_name}</p>)}
                    {selectedContact.customer ? (
                      <div className="flex flex-col">
                        <p className="text-xs" style={{ color: platformColor }}>{selectedContact.customer.name}</p>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400">
                          {selectedContact.last_order_date ? (<>ล่าสุด {new Date(selectedContact.last_order_created_at || selectedContact.last_order_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} {selectedContact.last_order_created_at && new Date(selectedContact.last_order_created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</>) : (<span className="text-orange-500">ยังไม่เคยสั่ง</span>)}
                        </p>
                        {selectedContact.avg_order_frequency != null && (<p className="text-[10px] text-gray-400 dark:text-slate-500">{selectedContact.avg_order_frequency <= 1 ? 'สั่งทุกวัน' : `~${selectedContact.avg_order_frequency} วัน/ออเดอร์`}</p>)}
                      </div>
                    ) : (
                      <button onClick={() => { setShowLinkModal(true); setCustomerSearch(''); setCustomers([]); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><LinkIcon className="w-3 h-3" />เชื่อมกับลูกค้าในระบบ</button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 md:gap-2">
                  {selectedContact.customer ? (
                    <>
                      <button onClick={handleOpenHistory} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${rightPanel === 'history' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="ดูประวัติออเดอร์"><History className="w-4 h-4" />{!rightPanel && <span className="hidden sm:inline">ประวัติ</span>}</button>
                      <button onClick={() => { if (window.innerWidth < 768) setMobileView('order'); else setRightPanel(rightPanel === 'order' ? null : 'order'); }} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${rightPanel === 'order' ? 'bg-[#F4511E] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title={rightPanel === 'order' ? 'ปิดหน้าเปิดบิล' : 'เปิดบิล'}><ShoppingCart className="w-4 h-4" />{!rightPanel && <span className="hidden sm:inline">เปิดบิล</span>}</button>
                      <button onClick={handleOpenProfile} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${rightPanel === 'profile' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`} title="ดูข้อมูลลูกค้า"><User className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleOpenCreateCustomer} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium ${rightPanel === 'create-customer' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-700 dark:text-blue-400 hover:bg-blue-200'}`} title="สร้างลูกค้าใหม่"><UserPlus className="w-4 h-4" />{!rightPanel && <span className="hidden sm:inline">สร้างลูกค้า</span>}</button>
                      <button onClick={() => { setShowLinkModal(true); setCustomerSearch(''); setCustomers([]); }} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors text-sm font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600" title="เชื่อมลูกค้าที่มีอยู่"><LinkIcon className="w-4 h-4" />{!rightPanel && <span className="hidden sm:inline">เชื่อมลูกค้า</span>}</button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-900 relative">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-slate-400"><MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีข้อความ</p></div>
                ) : (
                  <>
                    <div ref={messagesTopRef} className="py-1">{loadingMore && (<div className="flex items-center justify-center py-2"><Loader2 className="w-4 h-4 text-gray-400 animate-spin" /></div>)}</div>
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'} gap-2`}>
                        {msg.direction === 'incoming' && (
                          <div className="flex-shrink-0 self-end">
                            {msg.sender_picture_url ? (<Image src={msg.sender_picture_url} alt={msg.sender_name || 'User'} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />) : (<div className="w-8 h-8 bg-gray-300 dark:bg-slate-600 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-gray-500" /></div>)}
                          </div>
                        )}
                        <div className="flex flex-col">
                          {msg.direction === 'incoming' && msg.sender_name && (<span className="text-xs text-gray-500 mb-0.5 ml-1">{msg.sender_name}</span>)}
                          <div className="flex items-end gap-1.5">
                            {msg.direction === 'outgoing' && (
                              <div className="flex flex-col items-end self-end mb-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                                {msg.sent_by_user && <span>{msg.sent_by_user.name}</span>}
                                <div className="flex items-center gap-1">
                                  {msg._status === 'failed' && (<button onClick={() => { sendMessage(msg); }} className="flex items-center gap-0.5 text-red-500 hover:text-red-600" title="ส่งไม่สำเร็จ กดเพื่อลองใหม่"><AlertCircle className="w-3 h-3" /><RotateCcw className="w-2.5 h-2.5" /></button>)}
                                  {msg._status === 'sending' && (<Loader2 className="w-2.5 h-2.5 animate-spin text-gray-400" />)}
                                  {msg._status === 'sent' && (<Check className="w-2.5 h-2.5" style={{ color: platformColor }} />)}
                                  <span>{formatTime(msg.created_at)}</span>
                                </div>
                              </div>
                            )}
                            <div className={`rounded-2xl max-w-[75vw] md:max-w-[min(70vw,400px)] ${msg.message_type === 'sticker' ? 'bg-transparent' : msg.direction === 'outgoing'
                              ? msg._status === 'failed' ? 'bg-red-400 text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                              : msg._status === 'sending' ? 'text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2' : 'text-white rounded-br-sm px-3 py-1.5 md:px-4 md:py-2'
                              : 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-bl-sm shadow-sm px-3 py-1.5 md:px-4 md:py-2'}`}
                              style={msg.message_type !== 'sticker' && msg.direction === 'outgoing' && msg._status !== 'failed' ? { backgroundColor: msg._status === 'sending' ? platformColor + 'B3' : platformColor } : undefined}>
                              {msg.message_type === 'sticker' && msg.raw_message?.stickerId ? (
                                <img src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${msg.raw_message.stickerId}/iPhone/sticker@2x.png`} alt="sticker" className="w-24 h-24 object-contain"
                                  onError={(e) => { const img = e.target as HTMLImageElement; const sid = msg.raw_message?.stickerId; if (img.src.includes('sticker@2x.png')) img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${sid}/iPhone/sticker.png`; else if (img.src.includes('sticker.png')) img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${sid}/android/sticker.png`; }} />
                              ) : msg.message_type === 'image' && msg.raw_message?.imageUrl ? (
                                <img src={msg.raw_message.imageUrl} alt="image" className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onClick={() => openLightbox(msg.raw_message!.imageUrl!)} onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} />
                              ) : msg.message_type === 'video' && msg.raw_message?.videoUrl ? (
                                <div className="relative max-w-full max-h-64 rounded-lg cursor-pointer overflow-hidden group" onClick={() => openLightbox(msg.raw_message!.videoUrl!)}>
                                  {msg.raw_message.previewUrl ? (<img src={msg.raw_message.previewUrl} alt="video preview" className="max-w-full max-h-64 rounded-lg" onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} />) : (<div className="w-48 h-32 bg-gray-800 rounded-lg flex items-center justify-center"><Play className="w-10 h-10 text-white" /></div>)}
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"><div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg"><Play className="w-6 h-6 text-gray-800 ml-0.5" /></div></div>
                                </div>
                              ) : msg.message_type === 'location' && msg.raw_message?.latitude && msg.raw_message?.longitude ? (
                                <a href={`https://www.google.com/maps?q=${msg.raw_message.latitude},${msg.raw_message.longitude}`} target="_blank" rel="noopener noreferrer" className="block">
                                  <div className="flex items-center gap-2"><span className="text-xl">📍</span><span className="underline">{msg.content}</span></div>
                                  {msg.raw_message.address && (<p className="text-xs opacity-70 mt-1">{msg.raw_message.address}</p>)}
                                </a>
                              ) : (<p className="whitespace-pre-wrap break-words">{msg.content}</p>)}
                            </div>
                            {msg.direction === 'incoming' && (<span className="text-[10px] text-gray-400 self-end mb-0.5 whitespace-nowrap">{formatTime(msg.created_at)}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollButton && (<button onClick={scrollToBottom} className="absolute bottom-24 left-1/2 -translate-x-1/2 p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:shadow-2xl transition-all z-20 animate-bounce" title="ไปที่ข้อความล่าสุด"><ArrowDown className="w-5 h-5" style={{ color: platformColor }} /></button>)}

              {/* Message Input */}
              <div className="p-2 md:p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 relative">
                {/* Sticker Picker - LINE only */}
                {showStickerPicker && selectedContact?.platform === 'line' && (
                  <div className="absolute bottom-full left-0 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-t-lg shadow-lg max-h-48 md:max-h-64 overflow-y-auto">
                    <div className="p-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-800">
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-300">เลือกสติกเกอร์</span>
                      <button onClick={() => setShowStickerPicker(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-2">
                      {officialStickers.map((pack) => (
                        <div key={pack.packageId} className="mb-3">
                          <div className="grid grid-cols-4 gap-1 md:gap-2">
                            {pack.stickers.map((stickerId) => (
                              <button key={stickerId} onClick={() => sendSticker(pack.packageId, stickerId)} className="p-1.5 md:p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <img src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker@2x.png`} alt="sticker" className="w-10 h-10 md:w-12 md:h-12 object-contain"
                                  onError={(e) => { const img = e.target as HTMLImageElement; if (img.src.includes('@2x')) img.src = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker.png`; }} />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-1 md:gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImage} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors disabled:opacity-50" style={{ color: uploadingImage ? undefined : undefined }} title="ส่งรูปภาพ">
                    {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  </button>
                  {/* Sticker button - LINE only */}
                  {selectedContact?.platform === 'line' && (
                    <button onClick={() => setShowStickerPicker(!showStickerPicker)} className={`p-2 rounded-full transition-colors ${showStickerPicker ? 'text-[#06C755] bg-[#06C755]/10' : 'text-gray-500 hover:text-[#06C755] hover:bg-gray-100 dark:hover:bg-slate-700'}`} title="ส่งสติกเกอร์"><Smile className="w-5 h-5" /></button>
                  )}
                  <input ref={inputRef} type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="พิมพ์ข้อความ..." className="flex-1 min-w-0 px-3 md:px-4 py-2 text-sm md:text-base border border-gray-300 rounded-full focus:outline-none focus:ring-2" style={{ '--tw-ring-color': platformColor } as any} />
                  <button onClick={() => { sendMessage(); }} disabled={!newMessage.trim()} className="p-2 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0" style={{ backgroundColor: platformColor }}><Send className="w-5 h-5" /></button>
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

        {/* Mobile Order View */}
        {mobileView === 'order' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><ShoppingCart className="w-5 h-5 text-[#F4511E]" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code} - {selectedContact.customer.name}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><OrderForm preselectedCustomerId={selectedContact.customer.id} embedded={true} onSuccess={() => { setMobileView('chat'); showToast('สร้างคำสั่งซื้อสำเร็จ!'); }} onSendBillToChat={sendBillToCustomer} onCancel={() => setMobileView('chat')} /></div>
          </div>
        )}

        {/* Mobile History View */}
        {mobileView === 'history' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><History className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code} - {selectedContact.customer.name}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : orderHistory.length === 0 ? (<div className="text-center py-8 text-gray-500 dark:text-slate-400"><History className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีประวัติออเดอร์</p></div>) : (<div className="space-y-3">{orderHistory.map(renderOrderCard)}</div>)}
            </div>
          </div>
        )}

        {/* Mobile Profile View */}
        {mobileView === 'profile' && selectedContact?.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
              <button onClick={handleOpenEditCustomer} className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors">แก้ไข</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {renderCustomerProfile()}
              <div className="mt-4 space-y-2">
                <button onClick={() => setMobileView('order')} className="w-full py-2 bg-[#F4511E] text-white rounded-lg font-medium hover:bg-[#D63B0E] transition-colors flex items-center justify-center gap-2"><ShoppingCart className="w-4 h-4" />เปิดบิล</button>
                <button onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')} className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">ดูรายละเอียดเต็ม</button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Edit Customer View */}
        {mobileView === 'edit-customer' && selectedContact?.customer && editCustomerInitialData && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('profile')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} initialData={editCustomerInitialData} onSubmit={handleUpdateCustomerInChat} onCancel={() => setMobileView('profile')} isEditing={true} isLoading={editingCustomer} error={editCustomerError} /></div>
          </div>
        )}

        {/* Mobile Create Customer View */}
        {mobileView === 'create-customer' && selectedContact && !selectedContact.customer && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('chat')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><UserPlus className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้างลูกค้าใหม่</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.platform === 'line' ? 'LINE' : 'Facebook'}: {selectedContact.display_name}</p></div></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} lineDisplayName={selectedContact.display_name} onSubmit={handleCreateCustomer} onCancel={() => setMobileView('chat')} isLoading={savingCustomer} error={customerError} /></div>
          </div>
        )}

        {/* Mobile Order Detail View */}
        {mobileView === 'order-detail' && selectedOrderId && (
          <div className="flex md:hidden w-full flex-col bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex items-center gap-3"><button onClick={() => setMobileView('history')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-6 h-6" /></button><FileText className="w-5 h-5 text-blue-500" /><h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดออเดอร์</h2></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><OrderForm key={`mobile-${selectedOrderId}`} editOrderId={selectedOrderId} embedded={true} onSuccess={() => { setMobileView('history'); showToast('บันทึกการแก้ไขสำเร็จ!'); if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id); }} onCancel={() => setMobileView('history')} /></div>
          </div>
        )}

        {/* Desktop Right Panels */}
        {rightPanel === 'order' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><ShoppingCart className="w-5 h-5 text-[#F4511E]" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code} - {selectedContact.customer.name}</p></div></div>
              <button onClick={() => setRightPanel(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><OrderForm preselectedCustomerId={selectedContact.customer.id} embedded={true} onSuccess={() => { setRightPanel(null); showToast('สร้างคำสั่งซื้อสำเร็จ!'); }} onSendBillToChat={sendBillToCustomer} onCancel={() => setRightPanel(null)} /></div>
          </div>
        )}

        {rightPanel === 'history' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><History className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ประวัติออเดอร์</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code} - {selectedContact.customer.name}</p></div></div>
              <button onClick={() => setRightPanel(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory ? (<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : orderHistory.length === 0 ? (<div className="text-center py-8 text-gray-500 dark:text-slate-400"><History className="w-12 h-12 mx-auto mb-2 text-gray-300" /><p>ยังไม่มีประวัติออเดอร์</p></div>) : (<div className="space-y-3">{orderHistory.map(renderOrderCard)}</div>)}
            </div>
          </div>
        )}

        {rightPanel === 'profile' && selectedContact?.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">ข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
              <div className="flex items-center gap-2">
                <button onClick={handleOpenEditCustomer} className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 rounded-lg transition-colors">แก้ไข</button>
                <button onClick={() => setRightPanel(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {renderCustomerProfile()}
              <div className="mt-4 space-y-2">
                <button onClick={() => setRightPanel('order')} className="w-full py-2 bg-[#F4511E] text-white rounded-lg font-medium hover:bg-[#D63B0E] transition-colors flex items-center justify-center gap-2"><ShoppingCart className="w-4 h-4" />เปิดบิล</button>
                <button onClick={() => window.open(`/customers/${selectedContact.customer!.id}`, '_blank')} className="w-full py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">ดูรายละเอียดเต็ม</button>
              </div>
            </div>
          </div>
        )}

        {rightPanel === 'edit-customer' && selectedContact?.customer && editCustomerInitialData && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><User className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">แก้ไขข้อมูลลูกค้า</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.customer.customer_code}</p></div></div>
              <button onClick={() => setRightPanel('profile')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} initialData={editCustomerInitialData} onSubmit={handleUpdateCustomerInChat} onCancel={() => setRightPanel('profile')} isEditing={true} isLoading={editingCustomer} error={editCustomerError} /></div>
          </div>
        )}

        {rightPanel === 'create-customer' && selectedContact && !selectedContact.customer && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><UserPlus className="w-5 h-5 text-blue-500" /><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">สร้างลูกค้าใหม่</h2><p className="text-xs text-gray-500 dark:text-slate-400">{selectedContact.platform === 'line' ? 'LINE' : 'Facebook'}: {selectedContact.display_name}</p></div></div>
              <button onClick={() => setRightPanel(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><CustomerForm compact={true} lineDisplayName={selectedContact.display_name} onSubmit={handleCreateCustomer} onCancel={() => setRightPanel(null)} isLoading={savingCustomer} error={customerError} /></div>
          </div>
        )}

        {rightPanel === 'order-detail' && selectedOrderId && (
          <div className="hidden md:flex flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
              <div className="flex items-center gap-3"><button onClick={() => setRightPanel('history')} className="p-1 -ml-1 text-gray-500 hover:text-gray-700"><ChevronLeft className="w-5 h-5" /></button><FileText className="w-5 h-5 text-blue-500" /><h2 className="text-lg font-semibold text-gray-900 dark:text-white">รายละเอียดออเดอร์</h2></div>
              <button onClick={() => setRightPanel(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><OrderForm key={selectedOrderId} editOrderId={selectedOrderId} embedded={true} onSuccess={() => { setRightPanel('history'); showToast('บันทึกการแก้ไขสำเร็จ!'); if (selectedContact?.customer) fetchOrderHistory(selectedContact.customer.id); }} onCancel={() => setRightPanel('history')} /></div>
          </div>
        )}
      </div>

      {/* Link Customer Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4 shadow-xl">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">เชื่อมกับลูกค้าในระบบ</h3>
              <button onClick={() => setShowLinkModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); if (e.target.value.length >= 2) fetchCustomers(e.target.value); }}
                  placeholder="ค้นหาชื่อหรือรหัสลูกค้า..." className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {loadingCustomers ? (<div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 text-gray-400 animate-spin" /></div>) : customers.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">{customerSearch.length >= 2 ? 'ไม่พบลูกค้า' : 'พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา'}</div>
                ) : (
                  <div className="space-y-1">
                    {customers.map((customer) => (
                      <button key={customer.id} onClick={() => linkCustomer(customer.id)} className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors flex items-center justify-between">
                        <div><div className="text-xs text-gray-400 dark:text-slate-500">{customer.customer_code}</div><div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>{customer.phone && (<div className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</div>)}</div>
                        <Check className="w-5 h-5" style={{ color: platformColor }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedContact?.customer && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700"><button onClick={() => linkCustomer(null)} className="w-full p-2 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors">ยกเลิกการเชื่อมกับลูกค้า</button></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Gallery Overlay */}
      {(lightboxIndex !== null || showGallery) && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={() => { setLightboxIndex(null); setShowGallery(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { if (showGallery && lightboxIndex !== null) setShowGallery(false); else { setLightboxIndex(null); setShowGallery(false); } } if (!showGallery && lightboxIndex !== null) { if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1); if (e.key === 'ArrowRight' && lightboxIndex < mediaList.length - 1) setLightboxIndex(lightboxIndex + 1); } }}
          tabIndex={0} ref={(el) => el?.focus()}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
            <span className="text-white/70 text-sm">{showGallery ? `แกลเลอรี่ (${mediaList.length})` : lightboxIndex !== null ? `${lightboxIndex + 1} / ${mediaList.length}` : ''}</span>
            <div className="flex items-center gap-2">
              {!showGallery && lightboxMedia && (
                <button onClick={async (e) => { e.stopPropagation(); try { const res = await fetch(lightboxMedia.url); const blob = await res.blob(); const blobUrl = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = blobUrl; const ext = lightboxMedia.type === 'video' ? 'mp4' : 'jpg'; a.download = `chat-${Date.now()}.${ext}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(blobUrl); } catch { window.open(lightboxMedia.url, '_blank'); } }}
                  className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white" title="บันทึก"><Download className="w-5 h-5" /></button>
              )}
              {mediaList.length > 1 && (<button onClick={(e) => { e.stopPropagation(); setShowGallery(!showGallery); }} className={`p-2.5 rounded-full transition-colors text-white ${showGallery ? 'bg-white/40' : 'bg-white/20 hover:bg-white/30'}`} title="แกลเลอรี่"><Images className="w-5 h-5" /></button>)}
              <button onClick={() => { setLightboxIndex(null); setShowGallery(false); }} className="p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white" title="ปิด"><X className="w-5 h-5" /></button>
            </div>
          </div>
          {showGallery ? (
            <div className="max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 mt-14" onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-3 gap-2">
                {mediaList.map((media, idx) => (
                  <button key={idx} onClick={() => { setShowGallery(false); setLightboxIndex(idx); }} className={`relative aspect-square rounded-lg overflow-hidden bg-gray-800 hover:opacity-80 transition-opacity ${lightboxIndex === idx ? 'ring-2 ring-white' : ''}`}>
                    {media.type === 'image' ? (<img src={media.url} alt="" className="w-full h-full object-cover" />) : (<><div className="w-full h-full bg-gray-800 flex items-center justify-center"><Play className="w-8 h-8 text-white/80" /></div><div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">VDO</div></>)}
                  </button>
                ))}
              </div>
            </div>
          ) : lightboxMedia && lightboxIndex !== null ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }} disabled={lightboxIndex <= 0} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10" title="รูปก่อนหน้า"><ChevronLeft className="w-6 h-6" /></button>
              <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }} disabled={lightboxIndex >= mediaList.length - 1} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/20 hover:bg-white/30 disabled:opacity-20 disabled:cursor-not-allowed rounded-full transition-colors text-white z-10" title="รูปถัดไป"><ChevronRight className="w-6 h-6" /></button>
              <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {lightboxMedia.type === 'image' ? (<img src={lightboxMedia.url} alt="Full size" className="max-w-full max-h-[85vh] object-contain rounded-lg select-none" draggable={false} />) : (<video key={lightboxMedia.url} src={lightboxMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg">เบราว์เซอร์ไม่รองรับการเล่นวิดีโอ</video>)}
              </div>
            </>
          ) : null}
        </div>
      )}
    </Layout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
      </div>
    }>
      <UnifiedChatPageContent />
    </Suspense>
  );
}
