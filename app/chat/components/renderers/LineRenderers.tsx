'use client';

import { ChatMessage } from '@/app/chat/lib/chatTypes';

interface RendererProps {
  msg: ChatMessage;
  direction: 'incoming' | 'outgoing';
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE FLEX MESSAGE RENDERER
// ═══════════════════════════════════════════════════════════════════════════

interface FlexContent {
  type: string;
  url?: string;
  text?: string;
  size?: string;
  weight?: string;
  color?: string;
  action?: { type: string; uri?: string; label?: string; text?: string };
  contents?: FlexContent[];
  body?: FlexContent;
  hero?: FlexContent;
  footer?: FlexContent;
  header?: FlexContent;
  flex?: number;
  layout?: string;
  aspectRatio?: string;
  aspectMode?: string;
  margin?: string;
  spacing?: string;
  wrap?: boolean;
}

interface ExtractedContent {
  images: string[];
  texts: { text: string; weight?: string; size?: string; color?: string }[];
  buttons: { label: string; url?: string }[];
}

function extractFlexContent(node: FlexContent): ExtractedContent {
  const result: ExtractedContent = { images: [], texts: [], buttons: [] };

  if (!node) return result;

  // Extract from current node
  if (node.type === 'image' && node.url) {
    result.images.push(node.url);
  } else if (node.type === 'text' && node.text) {
    result.texts.push({ text: node.text, weight: node.weight, size: node.size, color: node.color });
  } else if (node.type === 'button' && node.action) {
    result.buttons.push({
      label: node.action.label || node.action.text || 'Button',
      url: node.action.type === 'uri' ? node.action.uri : undefined,
    });
  }

  // Recurse into children
  const children = node.contents || [];
  for (const child of children) {
    const sub = extractFlexContent(child);
    result.images.push(...sub.images);
    result.texts.push(...sub.texts);
    result.buttons.push(...sub.buttons);
  }

  // Recurse into named sections
  for (const section of [node.hero, node.header, node.body, node.footer]) {
    if (section) {
      const sub = extractFlexContent(section);
      result.images.push(...sub.images);
      result.texts.push(...sub.texts);
      result.buttons.push(...sub.buttons);
    }
  }

  return result;
}

function FlexBubbleCard({ contents, direction }: { contents: FlexContent; direction: 'incoming' | 'outgoing' }) {
  const { images, texts, buttons } = extractFlexContent(contents);
  const heroImage = images[0];
  const title = texts[0];
  const subtitle = texts[1];
  const otherTexts = texts.slice(2, 5);

  const isIncoming = direction === 'incoming';

  return (
    <div className={`rounded-lg overflow-hidden border ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
      style={{ maxWidth: '280px' }}>
      {heroImage && (
        <img src={heroImage} alt="" className="w-full h-36 object-cover" />
      )}
      <div className="p-3 space-y-1">
        {title && (
          <p className={`font-semibold text-sm ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            {title.text}
          </p>
        )}
        {subtitle && (
          <p className={`text-xs ${isIncoming ? 'text-gray-500 dark:text-slate-400' : 'text-white/70'}`}>
            {subtitle.text}
          </p>
        )}
        {otherTexts.map((t, i) => (
          <p key={i} className={`text-xs ${isIncoming ? 'text-gray-600 dark:text-slate-300' : 'text-white/80'}`}>
            {t.text}
          </p>
        ))}
      </div>
      {buttons.length > 0 && (
        <div className={`px-3 pb-3 space-y-1 ${!heroImage && texts.length === 0 ? 'pt-3' : ''}`}>
          {buttons.map((btn, i) => (
            btn.url ? (
              <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer"
                className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
                  isIncoming ? 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-400' : 'border-white/30 text-white hover:bg-white/10'
                }`}>
                {btn.label}
              </a>
            ) : (
              <span key={i} className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
                isIncoming ? 'border-gray-200 text-gray-500' : 'border-white/20 text-white/70'
              }`}>
                {btn.label}
              </span>
            )
          ))}
        </div>
      )}
    </div>
  );
}

export function LineFlexRenderer({ msg, direction }: RendererProps) {
  const contents = msg.raw_message?.flexContents as FlexContent | undefined;

  if (!contents) {
    return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
  }

  const isIncoming = direction === 'incoming';

  // Carousel: array of bubbles
  if (contents.type === 'carousel' && contents.contents && contents.contents.length > 0) {
    return (
      <div className="space-y-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isIncoming ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-white/20 text-white/80'}`}>
          Flex Message
        </span>
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
          {contents.contents.map((bubble, i) => (
            <div key={i} className="flex-shrink-0 snap-start">
              <FlexBubbleCard contents={bubble} direction={direction} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Single bubble
  return (
    <div className="space-y-1">
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isIncoming ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-white/20 text-white/80'}`}>
        Flex Message
      </span>
      <FlexBubbleCard contents={contents} direction={direction} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE TEMPLATE RENDERER
// ═══════════════════════════════════════════════════════════════════════════

interface LineAction {
  type: string;
  label?: string;
  uri?: string;
  text?: string;
  data?: string;
}

interface LineTemplate {
  type: string;
  text?: string;
  title?: string;
  thumbnailImageUrl?: string;
  imageAspectRatio?: string;
  actions?: LineAction[];
  columns?: Array<{
    thumbnailImageUrl?: string;
    title?: string;
    text?: string;
    actions?: LineAction[];
  }>;
  imageColumns?: Array<{
    imageUrl?: string;
    action?: LineAction;
  }>;
}

function ActionButton({ action, isIncoming }: { action: LineAction; isIncoming: boolean }) {
  const label = action.label || action.text || 'Button';
  if (action.type === 'uri' && action.uri) {
    return (
      <a href={action.uri} target="_blank" rel="noopener noreferrer"
        className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
          isIncoming ? 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-400' : 'border-white/30 text-white hover:bg-white/10'
        }`}>
        {label}
      </a>
    );
  }
  return (
    <span className={`block text-center text-xs px-3 py-1.5 rounded-lg border ${
      isIncoming ? 'border-gray-200 text-gray-500 dark:border-slate-500 dark:text-slate-400' : 'border-white/20 text-white/70'
    }`}>
      {label}
    </span>
  );
}

function TemplateCard({ template, isIncoming }: { template: { thumbnailImageUrl?: string; title?: string; text?: string; actions?: LineAction[] }; isIncoming: boolean }) {
  return (
    <div className={`rounded-lg overflow-hidden border ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
      style={{ maxWidth: '280px' }}>
      {template.thumbnailImageUrl && (
        <img src={template.thumbnailImageUrl} alt="" className="w-full h-36 object-cover" />
      )}
      <div className="p-3 space-y-1">
        {template.title && (
          <p className={`font-semibold text-sm ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            {template.title}
          </p>
        )}
        {template.text && (
          <p className={`text-xs ${isIncoming ? 'text-gray-600 dark:text-slate-300' : 'text-white/80'}`}>
            {template.text}
          </p>
        )}
      </div>
      {template.actions && template.actions.length > 0 && (
        <div className="px-3 pb-3 space-y-1">
          {template.actions.map((action, i) => (
            <ActionButton key={i} action={action} isIncoming={isIncoming} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LineTemplateRenderer({ msg, direction }: RendererProps) {
  const template = msg.raw_message?.template as LineTemplate | undefined;

  if (!template) {
    return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
  }

  const isIncoming = direction === 'incoming';

  // Buttons template
  if (template.type === 'buttons') {
    return (
      <TemplateCard
        template={{
          thumbnailImageUrl: template.thumbnailImageUrl,
          title: template.title,
          text: template.text,
          actions: template.actions,
        }}
        isIncoming={isIncoming}
      />
    );
  }

  // Confirm template
  if (template.type === 'confirm') {
    return (
      <div className={`rounded-lg overflow-hidden border p-3 ${isIncoming ? 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700' : 'border-white/20 bg-white/10'}`}
        style={{ maxWidth: '280px' }}>
        {template.text && (
          <p className={`text-sm mb-2 ${isIncoming ? 'text-gray-900 dark:text-white' : 'text-white'}`}>
            {template.text}
          </p>
        )}
        {template.actions && (
          <div className="flex gap-2">
            {template.actions.map((action, i) => (
              <div key={i} className="flex-1">
                <ActionButton action={action} isIncoming={isIncoming} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Carousel template
  if (template.type === 'carousel' && template.columns && template.columns.length > 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
        {template.columns.map((col, i) => (
          <div key={i} className="flex-shrink-0 snap-start">
            <TemplateCard
              template={{
                thumbnailImageUrl: col.thumbnailImageUrl,
                title: col.title,
                text: col.text,
                actions: col.actions,
              }}
              isIncoming={isIncoming}
            />
          </div>
        ))}
      </div>
    );
  }

  // Image carousel template
  if (template.type === 'image_carousel' && template.imageColumns && template.imageColumns.length > 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'thin' }}>
        {template.imageColumns.map((col, i) => (
          <div key={i} className="flex-shrink-0 snap-start">
            {col.action?.type === 'uri' && col.action.uri ? (
              <a href={col.action.uri} target="_blank" rel="noopener noreferrer">
                <img src={col.imageUrl} alt={col.action.label || ''} className="w-40 h-40 object-cover rounded-lg" />
              </a>
            ) : (
              <img src={col.imageUrl} alt="" className="w-40 h-40 object-cover rounded-lg" />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback
  return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE IMAGEMAP RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export function ImagemapBubble({ msg, direction }: RendererProps) {
  const baseUrl = msg.raw_message?.baseUrl;

  if (!baseUrl) {
    return <p className="whitespace-pre-wrap break-words">{msg.content}</p>;
  }

  const isIncoming = direction === 'incoming';
  // LINE Imagemap provides images at various sizes: /240, /300, /460, /700, /1040
  const imageUrl = `${baseUrl}/700`;

  return (
    <div className="space-y-1">
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isIncoming ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-white/20 text-white/80'}`}>
        Imagemap
      </span>
      <img src={imageUrl} alt={msg.content || 'imagemap'} className="max-w-full rounded-lg" style={{ maxHeight: '300px' }} />
    </div>
  );
}
