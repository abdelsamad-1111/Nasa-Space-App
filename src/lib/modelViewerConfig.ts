// Must be imported BEFORE '@google/model-viewer': model-viewer reads this global
// config when it is defined. Both anatomy views use the local Draco decoder.
const g = self as unknown as { ModelViewerElement?: Record<string, unknown> };
g.ModelViewerElement = { ...(g.ModelViewerElement ?? {}), dracoDecoderLocation: '/draco/' };
export {};
