'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import {
  Search,
  Send,
  User,
  Loader2,
  ChevronLeft,
  Link as LinkIcon,
  X,
  Check,
  Phone,
  AlertCircle,
  RotateCcw,
  ImagePlus,
  ArrowDown,
  Filter,
  Bell,
  Facebook
} from 'lucide-react';

interface FbContact {
  id: string;
  fb_psid: string;
  fb_page_id?: string;
  display_name: string;
  picture_url?: string;
  status: string;
  customer_id?: string;
  customer?: {
    id: string;
    name: string;
    customer_code: string;
    phone?: string;
    email?: string;
  };
  unread_count: number;
  last_message_at?: string;
  last_message?: string;
}

interface FbMessage {
  id: string;
  fb_contact_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  content: string;
  sent_by?: string;
  sent_by_user?: {
    id: string;
    name: string;
  };
  raw_message?: {
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    fileUrl?: string;
    sticker_id?: number;
  };
  created_at: string;
  _status?: 'sending' | 'sent' | 'failed';
  _tempId?: string;
}

interface Customer {
  id: string;
  name: string;
  customer_code: string;
  phone?: string;
}

function FbChatPageContent() {
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<FbContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const contactsEndRef = useRef<HTMLDivElement>(null);

  // Selected contact state
  const [selectedContact, setSelectedContact] = useState<FbContact | null>(null);
  const [messages, setMessages] = useState<FbMessage[]>([]);
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

  // Scroll to bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Mobile view mode
  const [mobileView, setMobileView] = useState<'contacts' | 'chat'>('contacts');

  // Filter
  const [filterUnread, setFilterUnread] = useState(false);

  // Get account_id from URL params
  const accountId = searchParams.get('account_id');

  // Fetch contacts
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchContacts();
    }
  }, [authLoading, userProfile, searchTerm, filterUnread, accountId]);

  // Fetch messages when contact selected
  useEffect(() => {
    if (selectedContact) {
      fetchMessages(selectedContact.id);
      setMobileView('chat');
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
    setShowScrollButton(distanceFromBottom > 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // IntersectionObserver for infinite scroll on contacts
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

  // Supabase Realtime subscription
  useEffect(() => {
    const messagesChannel = supabase
      .channel('fb_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fb_messages' },
        async (payload) => {
          const newMsg = payload.new as FbMessage;
          if (selectedContact && newMsg.fb_contact_id === selectedContact.id) {
            setMessages(prev => {
              const existsById = prev.some(m => m.id === newMsg.id);
              if (existsById) return prev;
              if (newMsg.direction === 'outgoing') {
                const alreadyHave = prev.some(m => m.content === newMsg.content && m.direction === 'outgoing');
                if (alreadyHave) return prev;
              }
              return [...prev, newMsg];
            });
            if (newMsg.direction === 'incoming') {
              apiFetch(`/api/fb/messages?contact_id=${selectedContact.id}&limit=1`).catch(() => {});
            }
          }
          fetchContacts();
        }
      )
      .subscribe();

    const contactsChannel = supabase
      .channel('fb_contacts_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fb_contacts' },
        () => { fetchContacts(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [selectedContact]);

  const fetchContacts = async (loadMore = false) => {
    try {
      if (loadMore) setLoadingMoreContacts(true);
      const params = new URLSearchParams();
      if (accountId) params.set('account_id', accountId);
      if (searchTerm) params.set('search', searchTerm);
      if (filterUnread) params.set('unread_only', 'true');
      params.set('limit', '30');
      params.set('offset', loadMore ? contacts.length.toString() : '0');

      const response = await apiFetch(`/api/fb/contacts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch contacts');

      const result = await response.json();
      let contactsList = result.contacts || [];

      if (selectedContact) {
        contactsList = contactsList.map((c: FbContact) =>
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
        setTotalUnread(prev => prev + contactsList.reduce((sum: number, c: FbContact) => sum + c.unread_count, 0));
      } else {
        setTotalUnread(contactsList.reduce((sum: number, c: FbContact) => sum + c.unread_count, 0));
      }
    } catch (error) {
      console.error('Error fetching FB contacts:', error);
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
      const response = await apiFetch(`/api/fb/messages?contact_id=${contactId}&limit=${limit}&offset=${offset}`);
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
        setContacts(prev => prev.map(c =>
          c.id === contactId ? { ...c, unread_count: 0 } : c
        ));
      }
    } catch (error) {
      console.error('Error fetching FB messages:', error);
    } finally {
      setLoadingMessages(false);
      setLoadingMore(false);
    }
  };

  const sendMessage = (retryMessage?: FbMessage) => {
    const messageText = retryMessage?.content || newMessage.trim();
    if (!messageText || !selectedContact) return;

    const tempId = retryMessage?._tempId || `temp-${Date.now()}`;

    if (!retryMessage) {
      const optimisticMessage: FbMessage = {
        id: tempId,
        _tempId: tempId,
        fb_contact_id: selectedContact.id,
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
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'sending' as const } : m
      ));
    }

    const contactId = selectedContact.id;
    (async () => {
      try {
        const response = await apiFetch('/api/fb/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contactId, message: messageText })
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to send message');
        }
        const result = await response.json();
        if (result.message) {
          setMessages(prev => prev.map(m =>
            m._tempId === tempId ? { ...result.message, _status: 'sent' as const } : m
          ));
        }
      } catch (error) {
        console.error('Error sending FB message:', error);
        setMessages(prev => prev.map(m =>
          m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
        ));
      }
    })();
  };

  // Compress image
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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) { resolve(file); return; }
              if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) { resolve(blob); }
              else { quality -= 0.1; tryCompress(); }
            }, 'image/jpeg', quality
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
    if (!file.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพ', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)', 'error'); return; }

    const compressed = await compressImage(file);
    const tempId = `temp-${Date.now()}`;
    const localUrl = URL.createObjectURL(compressed);

    const optimisticMessage: FbMessage = {
      id: tempId,
      _tempId: tempId,
      fb_contact_id: selectedContact.id,
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

      const fileName = `admin-images/${Date.now()}-${file.name.replace(/\.[^.]+$/, '.jpg')}`;
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, compressed, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;

      const response = await apiFetch('/api/fb/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, type: 'image', imageUrl })
      });
      if (!response.ok) throw new Error('Failed to send image');
      const result = await response.json();
      if (result.message) {
        setMessages(prev => prev.map(m =>
          m._tempId === tempId ? { ...result.message, _status: 'sent' as const } : m
        ));
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'failed' as const } : m
      ));
      showToast('ส่งรูปภาพไม่สำเร็จ', 'error');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Link customer
  const linkCustomer = async (customerId: string) => {
    if (!selectedContact) return;
    try {
      const response = await apiFetch('/api/fb/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, customer_id: customerId })
      });
      if (!response.ok) throw new Error('Failed');
      const customer = customers.find(c => c.id === customerId);
      setSelectedContact(prev => prev ? { ...prev, customer_id: customerId, customer: customer || prev.customer } : null);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? { ...c, customer_id: customerId, customer: customer || c.customer } : c
      ));
      setShowLinkModal(false);
      showToast('เชื่อมลูกค้าสำเร็จ');
    } catch {
      showToast('เชื่อมลูกค้าไม่สำเร็จ', 'error');
    }
  };

  // Unlink customer
  const unlinkCustomer = async () => {
    if (!selectedContact) return;
    try {
      const response = await apiFetch('/api/fb/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedContact.id, customer_id: null })
      });
      if (!response.ok) throw new Error('Failed');
      setSelectedContact(prev => prev ? { ...prev, customer_id: undefined, customer: undefined } : null);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id ? { ...c, customer_id: undefined, customer: undefined } : c
      ));
      showToast('ยกเลิกเชื่อมลูกค้าสำเร็จ');
    } catch {
      showToast('ยกเลิกเชื่อมไม่สำเร็จ', 'error');
    }
  };

  // Fetch customers for linking
  const fetchCustomers = useCallback(async (search: string) => {
    setLoadingCustomers(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '20');
      const response = await apiFetch(`/api/customers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed');
      const result = await response.json();
      setCustomers(result.customers || []);
    } catch {
      console.error('Error fetching customers');
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  // Debounce customer search
  useEffect(() => {
    if (!showLinkModal) return;
    const timer = setTimeout(() => fetchCustomers(customerSearch), 300);
    return () => clearTimeout(timer);
  }, [customerSearch, showLinkModal, fetchCustomers]);

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'เมื่อกี้';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} นาที`;
    if (diff < 86400000) return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days} วันก่อน`;
    }
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  // Format message time (in chat)
  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  // Render message bubble
  const renderMessage = (msg: FbMessage) => {
    const isOutgoing = msg.direction === 'outgoing';
    const isFailed = msg._status === 'failed';
    const isSending = msg._status === 'sending';

    return (
      <div key={msg.id} className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-2`}>
        <div className={`max-w-[75%] ${isOutgoing ? 'order-1' : 'order-2'}`}>
          {/* Message bubble */}
          <div className={`rounded-2xl px-3 py-2 ${
            isOutgoing
              ? isFailed
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-[#1877F2] text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white'
          } ${isSending ? 'opacity-70' : ''}`}>
            {/* Image */}
            {msg.message_type === 'image' && msg.raw_message?.imageUrl && (
              <img
                src={msg.raw_message.imageUrl}
                alt="รูปภาพ"
                className="rounded-lg max-w-full max-h-60 object-contain mb-1 cursor-pointer"
              />
            )}
            {/* Text content */}
            {msg.message_type === 'text' && (
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
            )}
            {/* Other types */}
            {msg.message_type !== 'text' && msg.message_type !== 'image' && (
              <p className="text-sm italic">{msg.content}</p>
            )}
          </div>

          {/* Time & status */}
          <div className={`flex items-center gap-1 mt-0.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400 dark:text-slate-500">
              {formatMessageTime(msg.created_at)}
            </span>
            {isOutgoing && msg.sent_by_user && (
              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                {msg.sent_by_user.name}
              </span>
            )}
            {isSending && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
            {isFailed && (
              <button
                onClick={() => sendMessage(msg)}
                className="flex items-center gap-0.5 text-[10px] text-red-500 hover:text-red-700"
              >
                <AlertCircle className="w-3 h-3" />
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* Contacts List */}
        <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-800 ${
          mobileView !== 'contacts' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header */}
          <div className="p-3 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Facebook className="w-5 h-5 text-[#1877F2]" />
                <h2 className="font-semibold text-gray-900 dark:text-white">FB Chat</h2>
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {totalUnread}
                  </span>
                )}
              </div>
              <button
                onClick={() => setFilterUnread(!filterUnread)}
                className={`p-1.5 rounded-lg transition-colors ${
                  filterUnread ? 'bg-[#1877F2]/10 text-[#1877F2]' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="แสดงเฉพาะยังไม่อ่าน"
              >
                <Bell className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาผู้ติดต่อ..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1877F2]"
              />
            </div>
          </div>

          {/* Contacts list */}
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-[#1877F2] animate-spin" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                {searchTerm || filterUnread ? 'ไม่พบผู้ติดต่อ' : 'ยังไม่มีผู้ติดต่อ'}
              </div>
            ) : (
              <>
                {contacts.map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-100 dark:border-slate-700/50 ${
                      selectedContact?.id === contact.id ? 'bg-[#1877F2]/5 dark:bg-[#1877F2]/10' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {contact.picture_url ? (
                        <img src={contact.picture_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-[#1877F2]" />
                        </div>
                      )}
                      {contact.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium">
                          {contact.unread_count > 9 ? '9+' : contact.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium truncate ${
                          contact.unread_count > 0
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-slate-300'
                        }`}>
                          {contact.display_name}
                        </span>
                        {contact.last_message_at && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0 ml-1">
                            {formatTime(contact.last_message_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {contact.customer && (
                          <span className="text-[10px] text-[#1877F2] bg-[#1877F2]/10 px-1 py-0.5 rounded flex-shrink-0">
                            {contact.customer.customer_code}
                          </span>
                        )}
                        <span className={`text-xs truncate ${
                          contact.unread_count > 0
                            ? 'text-gray-600 dark:text-slate-300 font-medium'
                            : 'text-gray-400 dark:text-slate-500'
                        }`}>
                          {contact.last_message || ''}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                <div ref={contactsEndRef} className="h-4" />
                {loadingMoreContacts && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-gray-50 dark:bg-slate-900 ${
          mobileView !== 'chat' ? 'hidden md:flex' : 'flex'
        }`}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => { setMobileView('contacts'); setSelectedContact(null); }}
                  className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {selectedContact.picture_url ? (
                  <img src={selectedContact.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-[#1877F2]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedContact.display_name}
                  </h3>
                  {selectedContact.customer ? (
                    <p className="text-xs text-[#1877F2]">
                      {selectedContact.customer.name} ({selectedContact.customer.customer_code})
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">ยังไม่ได้เชื่อมลูกค้า</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {selectedContact.customer ? (
                    <button
                      onClick={unlinkCustomer}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="ยกเลิกเชื่อมลูกค้า"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setShowLinkModal(true); setCustomerSearch(''); }}
                      className="p-2 text-gray-400 hover:text-[#1877F2] transition-colors"
                      title="เชื่อมกับลูกค้า"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-3 relative"
              >
                <div ref={messagesTopRef} className="h-1" />
                {loadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  </div>
                )}
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    ยังไม่มีข้อความ
                  </div>
                ) : (
                  <>
                    {messages.map(msg => renderMessage(msg))}
                  </>
                )}
                <div ref={messagesEndRef} />

                {/* Scroll to bottom button */}
                {showScrollButton && (
                  <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 right-4 p-2 bg-white dark:bg-slate-700 rounded-full shadow-lg border border-gray-200 dark:border-slate-600 text-gray-500 hover:text-[#1877F2] transition-colors"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Message Input */}
              <div className="px-4 py-3 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="p-2 text-gray-400 hover:text-[#1877F2] transition-colors disabled:opacity-50"
                    title="ส่งรูปภาพ"
                  >
                    {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="พิมพ์ข้อความ..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-full bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1877F2]"
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!newMessage.trim()}
                    className="p-2 text-white bg-[#1877F2] rounded-full hover:bg-[#1565C0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Facebook className="w-16 h-16 text-gray-200 dark:text-slate-700 mx-auto mb-4" />
                <p className="text-gray-400 dark:text-slate-500">เลือกผู้ติดต่อเพื่อเริ่มแชท</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Link Customer Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-medium text-gray-900 dark:text-white">เชื่อมกับลูกค้า</h3>
              <button onClick={() => setShowLinkModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, รหัส, เบอร์โทร..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1877F2]"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {loadingCustomers ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : customers.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">ไม่พบลูกค้า</p>
              ) : (
                <div className="space-y-1">
                  {customers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => linkCustomer(customer.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#1877F2]/5 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{customer.name}</p>
                        <p className="text-xs text-gray-400">
                          {customer.customer_code}
                          {customer.phone && ` | ${customer.phone}`}
                        </p>
                      </div>
                      <Check className="w-4 h-4 text-transparent group-hover:text-[#1877F2]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function FbChatPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="w-6 h-6 text-[#1877F2] animate-spin" />
        </div>
      </Layout>
    }>
      <FbChatPageContent />
    </Suspense>
  );
}
