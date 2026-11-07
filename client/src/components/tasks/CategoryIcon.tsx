import {
  Armchair, Bike, Bone, BookOpen, Camera, Clapperboard, Download, Ellipsis, GraduationCap,
  House, Languages, Laptop, LayoutGrid, Package, Palette, PartyPopper, PawPrint, PenLine,
  School, Shapes, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Wrench, type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'shopping-bag': ShoppingBag,
  package: Package,
  'shopping-basket': ShoppingBasket,
  bike: Bike,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  languages: Languages,
  school: School,
  laptop: Laptop,
  download: Download,
  wrench: Wrench,
  smartphone: Smartphone,
  house: House,
  armchair: Armchair,
  'layout-grid': LayoutGrid,
  'paw-print': PawPrint,
  bone: Bone,
  palette: Palette,
  clapperboard: Clapperboard,
  camera: Camera,
  'pen-line': PenLine,
  'party-popper': PartyPopper,
  sparkles: Sparkles,
  ellipsis: Ellipsis,
  shapes: Shapes,
}

export function CategoryIcon({ name, className = 'h-5 w-5' }: { name?: string | null; className?: string }) {
  const Icon = ICONS[name || ''] || Ellipsis
  return <Icon className={className} aria-hidden="true" />
}
