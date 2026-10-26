/* ── Share-card palettes ───────────────────────────────────────────────────
 *
 * Each palette is a ShaderGradient (shadergradient.co) recipe plus a flat
 * fallback for devices without WebGL. The motion and geometry are the "Halo"
 * plane — the reference the owner picked — and only the colours change, so
 * every card moves the same way and is told apart by colour alone.
 *
 * Dark-led on purpose. Every word on a card is white, so the field behind it
 * has to stay deep; the yellow arrives as a glow travelling through it rather
 * than as a ground. ShaderGradient lights its plane, which lifts every colour,
 * so the hexes here are darker than they read on screen.
 */

import type { ShareCardKind } from './shareCard';

export type CardPaletteId = 'lime' | 'violet' | 'ember';

export interface CardPalette {
  id: CardPaletteId;
  label: string;
  /** ShaderGradient's three, in its own roles — found by testing, since the
   *  plane is lit and the roles are not what the names suggest:
   *    colour2 fills most of the frame (the deep field),
   *    colour3 is the band of light that travels across it,
   *    colour1 lights one edge.
   *  Its 3D light also pulls purples toward blue and greens away from yellow,
   *  so the hexes lean warm/red to land on the colour actually wanted. */
  colors: [string, string, string];
  /** How much light the scene gets. Per palette: a yellow band needs more
   *  light on purple than on green to read as yellow rather than ochre. */
  brightness: number;
  /** Flat stand-in, [deep, field, light], when WebGL is unavailable. */
  fallback: [string, string, string];
  /** The one bright accent on the card (the pill dot). */
  accent: string;
}

export const CARD_PALETTES: CardPalette[] = [
  /* Green × yellow — the marketplace's colour. */
  { id: 'lime',   label: 'Lime',   colors: ['#FFE600', '#0B7A3E', '#D4F500'], brightness: 1.8, fallback: ['#03200F', '#0B6B36', '#D8F23A'], accent: '#E3F53B' },
  /* Purple × yellow — events. */
  { id: 'violet', label: 'Violet', colors: ['#B026FF', '#2A0845', '#FFD400'], brightness: 1.6, fallback: ['#14052A', '#5B1FB8', '#F5C842'], accent: '#FFD84D' },
  /* Ember — lost & found, where the card is asking for help. Crimson, not
     orange, in the field: the text scrim darkens it, and darkened orange is
     brown where darkened crimson is still red. Same reason Lime's field is
     emerald rather than a yellow-green. */
  { id: 'ember',  label: 'Ember',  colors: ['#FFB000', '#B0100E', '#FF7A00'], brightness: 1.6, fallback: ['#1E0303', '#8E0C0C', '#FF8A1F'], accent: '#FFB347' },
];

/** Which palette a card opens on — the board's own colour. */
export function defaultPaletteFor(kind: ShareCardKind): CardPaletteId {
  switch (kind) {
    case 'event':   return 'violet';
    case 'lost':
    case 'found':   return 'ember';
    default:        return 'lime';
  }
}

export function paletteById(id: CardPaletteId): CardPalette {
  return CARD_PALETTES.find(p => p.id === id) ?? CARD_PALETTES[0];
}

/** The ShaderGradient props for a palette. Halo's plane, darker light. */
export function shaderPropsFor(p: CardPalette, animate: boolean) {
  return {
    type: 'plane' as const,
    animate: (animate ? 'on' : 'off') as 'on' | 'off',
    uTime: 0,
    uSpeed: 0.4,
    uStrength: 4,
    uDensity: 1.3,
    uFrequency: 5.5,
    uAmplitude: 1,
    positionX: -1.4, positionY: 0, positionZ: 0,
    rotationX: 0, rotationY: 10, rotationZ: 50,
    color1: p.colors[0], color2: p.colors[1], color3: p.colors[2],
    reflection: 0.1,
    wireframe: false,
    shader: 'defaults',
    cAzimuthAngle: 180, cPolarAngle: 90, cDistance: 3.6,
    /* Halo is framed for a wide screen; on a square its plane leaves a corner
       bare, so the camera moves in. */
    cameraZoom: 1.3,
    lightType: '3d' as const,
    brightness: p.brightness,
    envPreset: 'city' as const,
    /* Off: ShaderGradient's grain is an RGB dot screen that shifts hue (it
       turned this purple blue). The card adds monochrome film grain itself. */
    grain: 'off' as const,
    toggleAxis: false,
    zoomOut: false,
    enableTransition: false,
  };
}
