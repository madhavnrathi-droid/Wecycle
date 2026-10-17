'use client';

/* ── Icons: Phosphor, drawn light ──────────────────────────────────────────
 *
 * The app's icons were Lucide at its default 2px stroke. Next to body text that
 * stroke is heavier than the type, so every row read as "icon first, words
 * second" — the opposite of the hierarchy we want, where the words carry the
 * meaning and the glyph only labels it.
 *
 * Phosphor's LIGHT weight is a 1.125px line on a 24px icon: the same optical
 * weight as 15–17px regular text, so an icon sits beside a label instead of
 * shouting over it. Phosphor also ships a FILL weight drawn on the same
 * skeleton, which is what a selected tab or a liked heart should switch to —
 * a shape change, not a colour or stroke change.
 *
 * Every screen already imports these glyphs by their Lucide names, with
 * Lucide's props (`size`, `strokeWidth`, `fill`). Rather than rewrite ~70
 * files, this module keeps that contract and maps each name to its Phosphor
 * counterpart:
 *
 *   strokeWidth ≥ 2.6     → regular   (the few places that asked for "bold")
 *   anything else         → light
 *   fill (not "none")     → fill      (Lucide's way of drawing a solid heart)
 *   weight="…"            → passed straight through, for new code
 *
 * Name traps worth knowing: Lucide `Menu` (hamburger) is Phosphor `List`, and
 * Lucide `List` (bullets) is Phosphor `ListBullets`. Lucide `Share2` is the
 * three-dot graph; we use Phosphor `Export` — the box-and-arrow share glyph
 * people recognise from iOS.
 */

import { forwardRef, type ComponentType, type SVGProps } from 'react';
import type { IconProps as PhIconProps, IconWeight } from '@phosphor-icons/react';
import {
  WarningCircle, Warning, ArrowDown as PhArrowDown, ArrowLeft as PhArrowLeft, ArrowRight as PhArrowRight,
  ArrowUp as PhArrowUp, ArrowsDownUp, ArrowUpRight as PhArrowUpRight, Medal, SealCheck, Prohibit, ChartBar,
  Bell as PhBell, BellRinging, BookmarkSimple, Buildings, CalendarBlank, CalendarDots, Camera as PhCamera,
  Check as PhCheck, CheckCircle as PhCheckCircle, CaretDown, CaretLeft, CaretRight, CaretUp, ClipboardText,
  Clock as PhClock, Copy as PhCopy, ArrowElbowDownRight, DownloadSimple, ArrowSquareOut, Eye as PhEye, EyeSlash,
  FileText as PhFileText, Flag as PhFlag, Globe as PhGlobe, GraduationCap as PhGraduationCap, GridNine,
  Heart as PhHeart, House, IdentificationCard, Image as PhImage, CurrencyInr, Info as PhInfo, Key, Lifebuoy,
  LinkSimple, ListBullets, CircleNotch, Lock as PhLock, SignOut, EnvelopeSimple, EnvelopeSimpleOpen,
  MapPin as PhMapPin, Megaphone as PhMegaphone, List as PhList, ChatCircle, Chat, Minus as PhMinus, DotsThree,
  Newspaper as PhNewspaper, Package as PhPackage, Paperclip as PhPaperclip, PencilSimple, Phone as PhPhone,
  Play as PhPlay, Plus as PhPlus, ArrowBendUpLeft, ArrowCounterClockwise, ArrowClockwise, FloppyDisk,
  Scissors as PhScissors, MagnifyingGlass, PaperPlaneTilt, GearSix, Export, Shield as PhShield,
  ShieldCheck as PhShieldCheck, Bag, Shuffle as PhShuffle, SlidersHorizontal as PhSlidersHorizontal, Sparkle,
  Star as PhStar, Storefront, Tag as PhTag, Ticket as PhTicket, Trash, TrendUp, User as PhUser, UserMinus,
  Users as PhUsers, SpeakerHigh, SpeakerX, MagicWand, X as PhX,
  Archive as PhArchive, Binoculars as PhBinoculars, Gift as PhGift, Wrench as PhWrench,
  HandHeart as PhHandHeart, Briefcase as PhBriefcase, Laptop as PhLaptop, BookOpen as PhBookOpen,
  TShirt as PhTShirt, Armchair as PhArmchair, Bicycle as PhBicycle, CookingPot as PhCookingPot,
  Guitar as PhGuitar, Basketball as PhBasketball, PaintBrush as PhPaintBrush, Plant as PhPlant,
  DeviceMobile as PhDeviceMobile, Headphones as PhHeadphones, Lamp as PhLamp, Backpack as PhBackpack,
  PencilRuler as PhPencilRuler, GameController as PhGameController, Car as PhCar,   Sneaker as PhSneaker, Watch as PhWatch, Couch as PhCouch, Desktop as PhDesktop, Calculator as PhCalculator,
  Swap as PhSwap, HandCoins as PhHandCoins, Question as PhQuestion, Cube as PhCube, Barcode as PhBarcode,
  Handshake as PhHandshake, PawPrint as PhPawPrint, SquaresFour as PhSquaresFour, Flower as PhFlower,
  Lightning as PhLightning, ArrowsLeftRight as PhArrowsLeftRight, Coffee as PhCoffee,
  Rocket as PhRocket, Leaf as PhLeaf, Trophy as PhTrophy, Flask as PhFlask, HandWaving as PhHandWaving,
  Recycle as PhRecycle, PiggyBank as PhPiggyBank, Hash as PhHash, TextT as PhTextT,
  TextAlignLeft as PhTextAlignLeft, RadioButton as PhRadioButton, CheckSquare as PhCheckSquare,
  CaretCircleDown as PhCaretCircleDown, TrashSimple as PhTrashSimple, Tray as PhTray, Bug as PhBug,
  Lightbulb as PhLightbulb, Palette as PhPalette, SmileyMeh as PhSmileyMeh, Bed as PhBed,
  Hammer as PhHammer, Plug as PhPlug, ProjectorScreen as PhProjectorScreen,
} from '@phosphor-icons/react';

type PhosphorIcon = ComponentType<PhIconProps>;

export type IconComponentProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'fill'> & {
  size?: number | string;
  /** Lucide's knob. Only "heavy" (≥2.6) changes anything — see the header. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  color?: string;
  /** Lucide draws a solid glyph when given a fill; we switch to Phosphor's fill weight. */
  fill?: string;
  /** New code can ask for a Phosphor weight directly. */
  weight?: IconWeight;
  mirrored?: boolean;
};

export type LucideIcon = ComponentType<IconComponentProps>;
export type LucideProps = IconComponentProps;

function weightFor(p: IconComponentProps): IconWeight {
  if (p.weight) return p.weight;
  if (p.fill && p.fill !== 'none' && p.fill !== 'transparent') return 'fill';
  const sw = typeof p.strokeWidth === 'string' ? parseFloat(p.strokeWidth) : p.strokeWidth;
  if (sw != null && sw >= 2.6) return 'regular';
  return 'light';
}

function make(Ph: PhosphorIcon, name: string): LucideIcon {
  const C = forwardRef<SVGSVGElement, IconComponentProps>(function Icon(props, ref) {
    /* Pull Lucide-only props off so they never land on the <svg> as unknown attributes. */
    const { size = 24, strokeWidth: _sw, absoluteStrokeWidth: _abs, fill: _fill, weight: _w, color, ...rest } = props;
    void _sw; void _abs; void _fill; void _w;
    return <Ph ref={ref as never} size={size} color={color ?? 'currentColor'} weight={weightFor(props)} {...(rest as object)} />;
  });
  C.displayName = name;
  return C as unknown as LucideIcon;
}

export const AlertCircle = make(WarningCircle, 'AlertCircle');
export const AlertTriangle = make(Warning, 'AlertTriangle');
export const TriangleAlert = make(Warning, 'TriangleAlert');
export const ArrowDown = make(PhArrowDown, 'ArrowDown');
export const ArrowLeft = make(PhArrowLeft, 'ArrowLeft');
export const ArrowRight = make(PhArrowRight, 'ArrowRight');
export const ArrowUp = make(PhArrowUp, 'ArrowUp');
export const ArrowUpDown = make(ArrowsDownUp, 'ArrowUpDown');
export const ArrowUpRight = make(PhArrowUpRight, 'ArrowUpRight');
export const Award = make(Medal, 'Award');
export const BadgeCheck = make(SealCheck, 'BadgeCheck');
export const Ban = make(Prohibit, 'Ban');
export const BarChart3 = make(ChartBar, 'BarChart3');
export const Bell = make(PhBell, 'Bell');
export const BellPlus = make(BellRinging, 'BellPlus');
export const BellRing = make(BellRinging, 'BellRing');
export const Bookmark = make(BookmarkSimple, 'Bookmark');
export const Building2 = make(Buildings, 'Building2');
export const Calendar = make(CalendarBlank, 'Calendar');
export const CalendarDays = make(CalendarDots, 'CalendarDays');
export const Camera = make(PhCamera, 'Camera');
export const Check = make(PhCheck, 'Check');
export const CheckCircle = make(PhCheckCircle, 'CheckCircle');
export const ChevronDown = make(CaretDown, 'ChevronDown');
export const ChevronLeft = make(CaretLeft, 'ChevronLeft');
export const ChevronRight = make(CaretRight, 'ChevronRight');
export const ChevronUp = make(CaretUp, 'ChevronUp');
export const ClipboardList = make(ClipboardText, 'ClipboardList');
export const Clock = make(PhClock, 'Clock');
export const Copy = make(PhCopy, 'Copy');
export const CornerDownRight = make(ArrowElbowDownRight, 'CornerDownRight');
export const Download = make(DownloadSimple, 'Download');
export const ExternalLink = make(ArrowSquareOut, 'ExternalLink');
export const Eye = make(PhEye, 'Eye');
export const EyeOff = make(EyeSlash, 'EyeOff');
export const FileText = make(PhFileText, 'FileText');
export const Flag = make(PhFlag, 'Flag');
export const Globe = make(PhGlobe, 'Globe');
export const GraduationCap = make(PhGraduationCap, 'GraduationCap');
export const Grid3X3 = make(GridNine, 'Grid3X3');
export const Heart = make(PhHeart, 'Heart');
export const Home = make(House, 'Home');
export const IdCard = make(IdentificationCard, 'IdCard');
export const ImagePlus = make(PhImage, 'ImagePlus');
export const IndianRupee = make(CurrencyInr, 'IndianRupee');
export const Info = make(PhInfo, 'Info');
export const KeyRound = make(Key, 'KeyRound');
export const LifeBuoy = make(Lifebuoy, 'LifeBuoy');
export const Link2 = make(LinkSimple, 'Link2');
export const List = make(ListBullets, 'List');
export const Loader2 = make(CircleNotch, 'Loader2');
export const Lock = make(PhLock, 'Lock');
export const LogOut = make(SignOut, 'LogOut');
export const Mail = make(EnvelopeSimple, 'Mail');
export const MailWarning = make(EnvelopeSimpleOpen, 'MailWarning');
export const MapPin = make(PhMapPin, 'MapPin');
export const Megaphone = make(PhMegaphone, 'Megaphone');
export const Menu = make(PhList, 'Menu');
export const MessageCircle = make(ChatCircle, 'MessageCircle');
export const MessageSquare = make(Chat, 'MessageSquare');
export const Minus = make(PhMinus, 'Minus');
export const MoreHorizontal = make(DotsThree, 'MoreHorizontal');
export const Newspaper = make(PhNewspaper, 'Newspaper');
export const Package = make(PhPackage, 'Package');
export const Paperclip = make(PhPaperclip, 'Paperclip');
export const Pencil = make(PencilSimple, 'Pencil');
export const Phone = make(PhPhone, 'Phone');
export const Play = make(PhPlay, 'Play');
export const Plus = make(PhPlus, 'Plus');
export const Reply = make(ArrowBendUpLeft, 'Reply');
export const RotateCcw = make(ArrowCounterClockwise, 'RotateCcw');
export const RotateCw = make(ArrowClockwise, 'RotateCw');
export const Save = make(FloppyDisk, 'Save');
export const Scissors = make(PhScissors, 'Scissors');
export const Search = make(MagnifyingGlass, 'Search');
export const Send = make(PaperPlaneTilt, 'Send');
export const Settings = make(GearSix, 'Settings');
export const Share2 = make(Export, 'Share2');
export const Shield = make(PhShield, 'Shield');
export const ShieldCheck = make(PhShieldCheck, 'ShieldCheck');
export const ShoppingBag = make(Bag, 'ShoppingBag');
export const Shuffle = make(PhShuffle, 'Shuffle');
export const SlidersHorizontal = make(PhSlidersHorizontal, 'SlidersHorizontal');
export const Sparkles = make(Sparkle, 'Sparkles');
export const Star = make(PhStar, 'Star');
export const Store = make(Storefront, 'Store');
export const Tag = make(PhTag, 'Tag');
export const Ticket = make(PhTicket, 'Ticket');
export const Trash2 = make(Trash, 'Trash2');
export const TrendingUp = make(TrendUp, 'TrendingUp');
export const User = make(PhUser, 'User');
export const UserX = make(UserMinus, 'UserX');
export const Users = make(PhUsers, 'Users');
export const Volume2 = make(SpeakerHigh, 'Volume2');
export const VolumeX = make(SpeakerX, 'VolumeX');
export const WandSparkles = make(MagicWand, 'WandSparkles');
export const X = make(PhX, 'X');

/* ── Names Lucide never had ──
   New code asks for Phosphor's own names (and its `weight` prop) directly. */
export const Archive = make(PhArchive, 'Archive');
export const Binoculars = make(PhBinoculars, 'Binoculars');
export const Gift = make(PhGift, 'Gift');
export const Wrench = make(PhWrench, 'Wrench');
export const HandHeart = make(PhHandHeart, 'HandHeart');
export const Briefcase = make(PhBriefcase, 'Briefcase');
export const Laptop = make(PhLaptop, 'Laptop');
export const BookOpen = make(PhBookOpen, 'BookOpen');
export const TShirt = make(PhTShirt, 'TShirt');
export const Armchair = make(PhArmchair, 'Armchair');
export const Bicycle = make(PhBicycle, 'Bicycle');
export const CookingPot = make(PhCookingPot, 'CookingPot');
export const Guitar = make(PhGuitar, 'Guitar');
export const Basketball = make(PhBasketball, 'Basketball');
export const PaintBrush = make(PhPaintBrush, 'PaintBrush');
export const Plant = make(PhPlant, 'Plant');
export const DeviceMobile = make(PhDeviceMobile, 'DeviceMobile');
export const Headphones = make(PhHeadphones, 'Headphones');
export const Lamp = make(PhLamp, 'Lamp');
export const Backpack = make(PhBackpack, 'Backpack');
export const PencilRuler = make(PhPencilRuler, 'PencilRuler');
export const GameController = make(PhGameController, 'GameController');
export const Car = make(PhCar, 'Car');
export const Sneaker = make(PhSneaker, 'Sneaker');
export const Watch = make(PhWatch, 'Watch');
export const Couch = make(PhCouch, 'Couch');
export const Desktop = make(PhDesktop, 'Desktop');
export const Calculator = make(PhCalculator, 'Calculator');
export const Swap = make(PhSwap, 'Swap');
export const HandCoins = make(PhHandCoins, 'HandCoins');
export const Question = make(PhQuestion, 'Question');
export const Cube = make(PhCube, 'Cube');
export const Barcode = make(PhBarcode, 'Barcode');
export const Handshake = make(PhHandshake, 'Handshake');
export const PawPrint = make(PhPawPrint, 'PawPrint');
export const SquaresFour = make(PhSquaresFour, 'SquaresFour');
export const Flower = make(PhFlower, 'Flower');
export const Lightning = make(PhLightning, 'Lightning');
export const ArrowsLeftRight = make(PhArrowsLeftRight, 'ArrowsLeftRight');
export const Coffee = make(PhCoffee, 'Coffee');
export const Rocket = make(PhRocket, 'Rocket');
export const Leaf = make(PhLeaf, 'Leaf');
export const Trophy = make(PhTrophy, 'Trophy');
export const Flask = make(PhFlask, 'Flask');
export const HandWaving = make(PhHandWaving, 'HandWaving');
export const Recycle = make(PhRecycle, 'Recycle');
export const PiggyBank = make(PhPiggyBank, 'PiggyBank');
export const Hash = make(PhHash, 'Hash');
export const TextT = make(PhTextT, 'TextT');
export const TextAlignLeft = make(PhTextAlignLeft, 'TextAlignLeft');
export const RadioButton = make(PhRadioButton, 'RadioButton');
export const CheckSquare = make(PhCheckSquare, 'CheckSquare');
export const CaretCircleDown = make(PhCaretCircleDown, 'CaretCircleDown');
export const TrashSimple = make(PhTrashSimple, 'TrashSimple');
export const Tray = make(PhTray, 'Tray');
export const Bug = make(PhBug, 'Bug');
export const Lightbulb = make(PhLightbulb, 'Lightbulb');
export const Palette = make(PhPalette, 'Palette');
export const SmileyMeh = make(PhSmileyMeh, 'SmileyMeh');
export const Bed = make(PhBed, 'Bed');
export const Hammer = make(PhHammer, 'Hammer');
export const Plug = make(PhPlug, 'Plug');
export const ProjectorScreen = make(PhProjectorScreen, 'ProjectorScreen');

/* ── Emoji, drawn as glyphs ──
   A lot of option data (lib/dealTypes, lib/opportunity, …) still carries the
   emoji it was written with. Rendering through this keeps that data untouched
   — share-card copy and tests read it — while every picker in the UI draws
   the thin glyph instead of a sticker. Unknown emoji render nothing. */
const EMOJI_GLYPH: Record<string, LucideIcon> = {
  '🎁': Gift, '💸': IndianRupee, '🔁': RotateCcw, '🔄': ArrowsLeftRight,
  '🧑‍💼': Briefcase, '🛠️': Wrench, '🌱': Plant, '🤝': Handshake, '💼': HandCoins,
  '🙂': Coffee, '⚡': Lightning, '📅': Calendar, '🔍': Search, '🙋': Megaphone,
  '📦': Package, '🔖': Bookmark, '🗂️': Archive, '💬': MessageCircle, '⏰': Clock,
};
export function EmojiGlyph({ emoji, size = 22, ...rest }: { emoji: string } & IconComponentProps) {
  const G = EMOJI_GLYPH[emoji];
  return G ? <G size={size} aria-hidden="true" {...rest} /> : null;
}
