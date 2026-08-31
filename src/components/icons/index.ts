import {
  Check,
  Circle,
  Highlighter,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Trash2,
} from 'lucide-react'
import { createHoverIcon, nudge, pulse, squash, wobble } from './motion-icon'

export type { AnimatedIcon, AnimatedIconHandle, AnimatedIconProps } from './motion-icon'

/* lucide-animated (https://lucide-animated.com) — vendored, MIT */
export { ArrowLeftIcon } from './arrow-left'
export { ArrowRightIcon } from './arrow-right'
export { ArrowUpRightIcon } from './arrow-up-right'
export { BookTextIcon } from './book-text'
export { BookmarkIcon } from './bookmark'
export { BotIcon } from './bot'
export { ChevronDownIcon } from './chevron-down'
export { CpuIcon } from './cpu'
export { DownloadIcon } from './download'
export { FileTextIcon } from './file-text'
export { FolderOpenIcon } from './folder-open'
export { HandIcon } from './hand'
export { LayersIcon } from './layers'
export { LockIcon } from './lock'
export { PanelLeftCloseIcon } from './panel-left-close'
export { PanelLeftOpenIcon } from './panel-left-open'
export { PlusIcon } from './plus'
export { RedoIcon } from './redo'
export { RotateCWIcon as RotateCwIcon } from './rotate-cw'
export { ScanTextIcon } from './scan-text'
export { SearchIcon } from './search'
export { UnderlineIcon } from './underline'
export { UndoIcon } from './undo'
export { UploadIcon } from './upload'
export { WrenchIcon } from '../ui/wrench'
export { XIcon } from './x'
export { ZapIcon } from './zap'

/* Lucide glyphs with no animated counterpart, given the same hover contract */
export const CheckIcon = createHoverIcon('CheckIcon', Check, pulse)
export const EllipseIcon = createHoverIcon('EllipseIcon', Circle, pulse)
export const HighlighterIcon = createHoverIcon('HighlighterIcon', Highlighter, wobble(14))
export const MinusIcon = createHoverIcon('MinusIcon', Minus, squash)
export const MoreIcon = createHoverIcon('MoreIcon', MoreHorizontal, pulse)
export const NoteIcon = createHoverIcon('NoteIcon', StickyNote, wobble(8))
export const PencilIcon = createHoverIcon('PencilIcon', Pencil, wobble(12))
export const PointerIcon = createHoverIcon('PointerIcon', MousePointer2, nudge(-2, -2))
export const RectangleIcon = createHoverIcon('RectangleIcon', RectangleHorizontal, pulse)
export const StrikethroughIcon = createHoverIcon('StrikethroughIcon', Strikethrough, squash)
export const TextBoxIcon = createHoverIcon('TextBoxIcon', TextCursorInput, nudge(0, -2))
export const ThreadIcon = createHoverIcon('ThreadIcon', MessageSquareText, nudge(0, -2))
export const TrashIcon = createHoverIcon('TrashIcon', Trash2, wobble(12))
