'use client';

/* The live ShaderGradient behind a share card.
 *
 * Loaded on demand (three.js is heavy and only this sheet needs it) and drawn
 * into a WebGL canvas that keeps its last frame (preserveDrawingBuffer), so
 * the share path can lift the exact frame on screen into the exported PNG —
 * what you see moving is what you get, frozen.
 *
 * Its pixel density is set so the drawing buffer is ~1080px across whatever
 * size the preview is shown at; the captured frame is then full card
 * resolution rather than a phone-width image stretched up.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';
import { shaderPropsFor, type CardPalette } from '../lib/cardPalettes';

export interface CardGradientHandle {
  /** The WebGL canvas, or null before it mounts. */
  canvas: () => HTMLCanvasElement | null;
}

interface Props {
  palette: CardPalette;
  animate: boolean;
  /** CSS width of the preview, used to aim the buffer at ~1080px. */
  cssSize: number;
}

const CardGradient = forwardRef<CardGradientHandle, Props>(function CardGradient({ palette, animate, cssSize }, ref) {
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    canvas: () => box.current?.querySelector('canvas') ?? null,
  }));
  const density = Math.min(4, Math.max(1, 1080 / Math.max(1, cssSize)));
  return (
    <div ref={box} style={{ position: 'absolute', inset: 0 }}>
      <ShaderGradientCanvas
        style={{ position: 'absolute', inset: 0 }}
        pixelDensity={density}
        pointerEvents="none"
        preserveDrawingBuffer
        lazyLoad={false}
      >
        <ShaderGradient {...shaderPropsFor(palette, animate)} control="props" />
      </ShaderGradientCanvas>
    </div>
  );
});

export default CardGradient;
