'use client';

import { ChatMessage } from '@/app/chat/lib/chatTypes';

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function FbButton({ btn, isIncoming }: {
  btn: { type: string; title: string; url?: string };
  isIncoming: boolean;
}) {
  if (btn.url) {
    return (
      <a href={btn.url} target="_blank" rel="noopener noreferrer"
        className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
          isIncoming ? 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-400' : 'border-white/30 text-white hover:bg-white/10'
        }`}>
        {btn.title}
      </a>
    );
  }
  return (
    <span className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
      isIncoming ? 'border-gray-200 text-gray-500 dark:border-slate-500 dark:text-slate-400' : 'border-white/20 text-white/70'
    }`}>
      {btn.title}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FB TEMPLATE DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

export function FbTemplateRenderer({ msg, direction }: RendererProps) {
  const templateType = msg.raw_message?.template_type;
  const isIncoming = direction === 'incoming';

  // Receipt template
  if (templateType === 'receipt') {
    return <FbReceiptTemplate msg={msg} isIncoming={isIncoming} />;
  }

  // Generic template (carousel cards with elements)
  if (templateType === 'generic' && msg.raw_message?.elements && msg.raw_message.elements.length > 0) {
    return <FbGenericTemplate msg={msg} isIncoming={isIncoming} />;
  }

  // Coupon template
  if (templateType === 'coupon') {
    return <FbCouponTemplate msg={msg} isIncoming={isIncoming} />;
  }

  // Product template (similar to generic)
  if (templateType === 'product' && msg.raw_message?.elements) {
    return <FbGenericTemplate msg={msg} isIncoming={isIncoming} />;
  }

  // Button template or any template with buttons
  if (msg.raw_message?.buttons && msg.raw_message.buttons.length > 0) {
    return <FbButtonTemplate msg={msg} isIncoming={isIncoming} />;
  }

  // Template with link only
  if (msg.raw_message?.linkUrl || msg.raw_message?.templateUrl) {
    const linkUrl = (msg.raw_message.linkUrl || msg.raw_message.templateUrl) as string;
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔗</span>
          <span className="underline break-all">{msg.content}</span>
        </div>
      </a>
    );
  }

  // Fallback
  return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FB GENERIC TEMPLATE (Carousel Cards)
// ═══════════════════════════════════════════════════════════════════════════

function FbGenericTemplate({ msg, isIncoming }: { msg: ChatMessage; isIncoming: boolean }) {
  const elements = msg.raw_message?.elements || [];

  if (elements.length === 1) {
    return <GenericCard element={elements[0]} isIncoming={isIncoming} />;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
      {elements.map((el, i) => (
        <div key={i} className="flex-shrink-0 snap-start">
          <GenericCard element={el} isIncoming={isIncoming} />
        </div>
      ))}
    </div>
  );
}

function GenericCard({ element, isIncoming }: {
  element: NonNullable<ChatMessage['raw_message']>['elements'] extends (infer T)[] | undefined ? T : never;
  isIncoming: boolean;
}) {
  if (!element) return null;

  return (
    <div className={`rounded-lg overflow-hidden border ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
      style={{ width: '250px' }}>
      {element.image_url && (
        <img src={element.image_url} alt={element.title || ''} className="w-full h-32 object-cover" />
      )}
      <div className="p-3 space-y-1">
        {element.title && (
          <p className={`font-semibold text-sm ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            {element.title}
          </p>
        )}
        {element.subtitle && (
          <p className={`text-xs ${isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/70'}`}>
            {element.subtitle}
          </p>
        )}
      </div>
      {element.buttons && element.buttons.length > 0 && (
        <div className="px-3 pb-3 space-y-1">
          {element.buttons.map((btn, i) => (
            <FbButton key={i} btn={btn} isIncoming={isIncoming} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FB BUTTON TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function FbButtonTemplate({ msg, isIncoming }: { msg: ChatMessage; isIncoming: boolean }) {
  const buttons = msg.raw_message?.buttons || [];

  return (
    <div>
      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
      {buttons.length > 0 && (
        <div className="mt-2 space-y-1">
          {buttons.map((btn, i) => (
            <FbButton key={i} btn={btn} isIncoming={isIncoming} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FB RECEIPT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function FbReceiptTemplate({ msg, isIncoming }: { msg: ChatMessage; isIncoming: boolean }) {
  const raw = msg.raw_message;
  if (!raw) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  const elements = raw.elements || [];
  const summary = raw.summary;
  const address = raw.receipt_address;

  return (
    <div className={`rounded-lg overflow-hidden border ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
      style={{ maxWidth: '300px' }}>
      {/* Header */}
      <div className={`px-3 py-2 ${isIncoming ? 'bg-gray-50 dark:bg-slate-600/50' : 'bg-white/10'}`}>
        <p className={`font-semibold text-sm ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
          🧾 {raw.recipient_name ? `สั่งซื้อโดย ${raw.recipient_name}` : 'ใบเสร็จ'}
        </p>
        {raw.order_number && (
          <p className={`text-xs ${isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}`}>
            #{raw.order_number}
          </p>
        )}
      </div>

      {/* Items */}
      {elements.length > 0 && (
        <div className="px-3 py-2 space-y-2">
          {elements.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {item.image_url && (
                <img src={item.image_url} alt={item.title || ''} className="w-10 h-10 rounded object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
                  {item.title}
                </p>
                {item.subtitle && (
                  <p className={`text-[10px] ${isIncoming ? 'text-gray-400 dark:text-slate-400' : 'text-white/50'}`}>
                    {item.subtitle}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {item.quantity && (
                  <p className={`text-[10px] ${isIncoming ? 'text-gray-400 dark:text-slate-400' : 'text-white/50'}`}>
                    x{item.quantity}
                  </p>
                )}
                {item.price != null && (
                  <p className={`text-xs font-medium ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
                    {item.currency || ''}{item.price.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Address */}
      {address && (
        <div className={`px-3 py-2 border-t ${isIncoming ? 'border-gray-100 dark:border-slate-600' : 'border-white/10'}`}>
          <p className={`text-[10px] font-medium mb-0.5 ${isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}`}>
            ที่อยู่จัดส่ง
          </p>
          <p className={`text-xs ${isIncoming ? 'text-gray-700 dark:text-slate-300' : 'text-white/80'}`}>
            {[address.street_1, address.street_2, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ')}
          </p>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className={`px-3 py-2 border-t ${isIncoming ? 'border-gray-100 dark:border-slate-600' : 'border-white/10'}`}>
          {summary.subtotal != null && (
            <div className="flex justify-between text-xs">
              <span className={isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}>ราคาสินค้า</span>
              <span className={isIncoming ? 'text-gray-700 dark:text-slate-300' : 'text-white/80'}>{summary.subtotal.toLocaleString()}</span>
            </div>
          )}
          {summary.shipping_cost != null && (
            <div className="flex justify-between text-xs">
              <span className={isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}>ค่าส่ง</span>
              <span className={isIncoming ? 'text-gray-700 dark:text-slate-300' : 'text-white/80'}>{summary.shipping_cost.toLocaleString()}</span>
            </div>
          )}
          {summary.total_tax != null && (
            <div className="flex justify-between text-xs">
              <span className={isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}>ภาษี</span>
              <span className={isIncoming ? 'text-gray-700 dark:text-slate-300' : 'text-white/80'}>{summary.total_tax.toLocaleString()}</span>
            </div>
          )}
          {summary.total_cost != null && (
            <div className="flex justify-between text-xs font-semibold mt-1 pt-1 border-t border-dashed border-gray-200 dark:border-slate-500">
              <span className={isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}>รวมทั้งหมด</span>
              <span className={isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}>{(raw.currency || '')}{summary.total_cost.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Payment method */}
      {raw.payment_method && (
        <div className={`px-3 py-2 border-t ${isIncoming ? 'border-gray-100 dark:border-slate-600' : 'border-white/10'}`}>
          <p className={`text-xs ${isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/60'}`}>
            ชำระโดย: {raw.payment_method}
          </p>
        </div>
      )}

      {/* Order URL */}
      {raw.order_url && (
        <div className={`px-3 py-2 border-t ${isIncoming ? 'border-gray-100 dark:border-slate-600' : 'border-white/10'}`}>
          <a href={raw.order_url} target="_blank" rel="noopener noreferrer"
            className={`text-xs ${isIncoming ? 'text-blue-600 hover:text-blue-700' : 'text-white/80 hover:text-white'} underline`}>
            ดูรายละเอียดคำสั่งซื้อ
          </a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FB COUPON TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// INSTAGRAM STORY MENTION
// ═══════════════════════════════════════════════════════════════════════════

export function StoryMentionBubble({ msg, direction }: RendererProps) {
  const storyUrl = msg.raw_message?.storyUrl;
  const isIncoming = direction === 'incoming';

  return (
    <div className={`rounded-lg overflow-hidden border ${isIncoming ? 'border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10' : 'border-white/20 bg-white/10'}`}
      style={{ maxWidth: '280px' }}>
      <div className="px-3 py-2">
        <p className={`text-xs font-medium ${isIncoming ? 'text-purple-600 dark:text-purple-400' : 'text-white/80'}`}>
          📸 กล่าวถึงคุณในสตอรี่
        </p>
      </div>
      {storyUrl && (
        <img src={storyUrl} alt="story" className="w-full max-h-48 object-cover" />
      )}
      {storyUrl && (
        <div className="px-3 py-2">
          <a href={storyUrl} target="_blank" rel="noopener noreferrer"
            className={`text-xs ${isIncoming ? 'text-purple-600 hover:text-purple-700 dark:text-purple-400' : 'text-white/80 hover:text-white'} underline`}>
            ดูสตอรี่
          </a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTAGRAM STORY REPLY
// ═══════════════════════════════════════════════════════════════════════════

export function StoryReplyBubble({ msg, direction }: RendererProps) {
  const storyUrl = msg.raw_message?.storyUrl;
  const isIncoming = direction === 'incoming';

  return (
    <div>
      {storyUrl && (
        <div className={`mb-1 rounded-lg overflow-hidden border ${isIncoming ? 'border-gray-200 dark:border-slate-600' : 'border-white/20'}`}
          style={{ maxWidth: '200px' }}>
          <div className={`px-2 py-1 text-[10px] ${isIncoming ? 'bg-gray-50 text-gray-500 dark:bg-slate-600/50 dark:text-slate-400' : 'bg-white/10 text-white/60'}`}>
            ตอบกลับสตอรี่
          </div>
          <img src={storyUrl} alt="story" className="w-full max-h-24 object-cover opacity-70" />
        </div>
      )}
      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FB COUPON TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

function FbCouponTemplate({ msg, isIncoming }: { msg: ChatMessage; isIncoming: boolean }) {
  const raw = msg.raw_message;
  if (!raw) return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;

  const couponUrl = raw.coupon_url || raw.templateUrl;
  const couponCode = raw.coupon_code;

  return (
    <div className={`rounded-lg overflow-hidden border p-3 ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
      style={{ maxWidth: '280px' }}>
      <p className={`font-semibold text-sm mb-1 ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
        🎟️ {msg.content || 'คูปอง'}
      </p>
      {couponCode && (
        <div className={`text-center py-2 px-3 my-2 rounded border-2 border-dashed ${
          isIncoming ? 'border-orange-300 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-500/10' : 'border-white/30 bg-white/5'
        }`}>
          <span className={`text-lg font-bold tracking-wider ${isIncoming ? 'text-orange-600 dark:text-orange-400' : 'text-white'}`}>
            {couponCode}
          </span>
        </div>
      )}
      {couponUrl && (
        <a href={couponUrl as string} target="_blank" rel="noopener noreferrer"
          className={`block text-center text-xs px-3 py-1.5 rounded-lg border mt-2 ${
            isIncoming ? 'border-blue-300 text-blue-600 hover:bg-blue-50' : 'border-white/30 text-white hover:bg-white/10'
          }`}>
          รับคูปอง
        </a>
      )}
    </div>
  );
}
