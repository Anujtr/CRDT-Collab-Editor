import React from 'react';
import { useSlate } from 'slate-react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Code, 
  Heading1, 
  Heading2,
  Quote,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { 
  isMarkActive, 
  toggleMark, 
  isBlockActive, 
  toggleBlock,
  CustomElement 
} from './SlateEditor';

interface ToolbarButtonProps {
  active?: boolean;
  onMouseDown: (event: React.MouseEvent) => void;
  children: React.ReactNode;
  title?: string;
}

function ToolbarButton({ active, onMouseDown, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className={cn(
        "p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
        "flex items-center justify-center",
        active 
          ? "bg-gray-200 dark:bg-gray-600 text-blue-600 dark:text-blue-400" 
          : "text-gray-700 dark:text-gray-300"
      )}
      data-testid={`toolbar-${title?.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {children}
    </button>
  );
}

interface ToolbarSeparatorProps {
  className?: string;
}

function ToolbarSeparator({ className }: ToolbarSeparatorProps) {
  return (
    <div 
      className={cn(
        "w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1",
        className
      )} 
    />
  );
}

interface EditorToolbarProps {
  className?: string;
}

export function EditorToolbar({ className }: EditorToolbarProps) {
  const editor = useSlate();

  const handleMarkButtonClick = (
    event: React.MouseEvent, 
    format: keyof Omit<import('./SlateEditor').CustomText, 'text'>
  ) => {
    event.preventDefault();
    toggleMark(editor, format);
  };

  const handleBlockButtonClick = (
    event: React.MouseEvent, 
    format: CustomElement['type']
  ) => {
    event.preventDefault();
    toggleBlock(editor, format);
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-1 p-3 border-b border-gray-200 dark:border-gray-700",
        "bg-gray-50 dark:bg-gray-800/50 rounded-t-lg",
        className
      )}
      data-testid="editor-toolbar"
    >
      {/* Text formatting */}
      <ToolbarButton
        active={isMarkActive(editor, 'bold')}
        onMouseDown={(e) => handleMarkButtonClick(e, 'bold')}
        title="Bold"
      >
        <Bold size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isMarkActive(editor, 'italic')}
        onMouseDown={(e) => handleMarkButtonClick(e, 'italic')}
        title="Italic"
      >
        <Italic size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isMarkActive(editor, 'underline')}
        onMouseDown={(e) => handleMarkButtonClick(e, 'underline')}
        title="Underline"
      >
        <Underline size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isMarkActive(editor, 'code')}
        onMouseDown={(e) => handleMarkButtonClick(e, 'code')}
        title="Code"
      >
        <Code size={16} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Block formatting */}
      <ToolbarButton
        active={isBlockActive(editor, 'heading-one')}
        onMouseDown={(e) => handleBlockButtonClick(e, 'heading-one')}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isBlockActive(editor, 'heading-two')}
        onMouseDown={(e) => handleBlockButtonClick(e, 'heading-two')}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isBlockActive(editor, 'block-quote')}
        onMouseDown={(e) => handleBlockButtonClick(e, 'block-quote')}
        title="Quote"
      >
        <Quote size={16} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Lists */}
      <ToolbarButton
        active={isBlockActive(editor, 'bulleted-list')}
        onMouseDown={(e) => handleBlockButtonClick(e, 'bulleted-list')}
        title="Bulleted List"
      >
        <List size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={isBlockActive(editor, 'numbered-list')}
        onMouseDown={(e) => handleBlockButtonClick(e, 'numbered-list')}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Alignment (placeholder for future implementation) */}
      <ToolbarButton
        active={false}
        onMouseDown={(e) => e.preventDefault()}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={false}
        onMouseDown={(e) => e.preventDefault()}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={false}
        onMouseDown={(e) => e.preventDefault()}
        title="Align Right"
      >
        <AlignRight size={16} />
      </ToolbarButton>
      
      <ToolbarButton
        active={false}
        onMouseDown={(e) => e.preventDefault()}
        title="Align Justify"
      >
        <AlignJustify size={16} />
      </ToolbarButton>
    </div>
  );
}