import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string;
  alt?: string;
  'camera-controls'?: boolean | string;
  'auto-rotate'?: boolean | string;
  'auto-rotate-delay'?: string;
  'rotation-per-second'?: string;
  'disable-pan'?: boolean | string;
  'disable-zoom'?: boolean | string;
  'disable-tap'?: boolean | string;
  'interaction-prompt'?: string;
  'camera-orbit'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  'min-field-of-view'?: string;
  'max-field-of-view'?: string;
  'field-of-view'?: string;
  'camera-target'?: string;
  'shadow-intensity'?: string;
  'shadow-softness'?: string;
  'tone-mapping'?: string;
  'environment-image'?: string;
  exposure?: string;
  loading?: string;
  reveal?: string;
  'touch-action'?: string;
  'interpolation-decay'?: string;
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes;
    }
  }
}
