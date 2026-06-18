import type { Preset } from '../types';

export const PRESETS: Preset[] = [
  {
    id: 'greenhouse-v2',
    name: 'Greenhouse 4m V2',
    description: '4m diameter V2 dome with ¾ PVC for greenhouse frames',
    settings: {
      freq: 2,
      diam: 4.0,
      trunc: 0.625,
      matType: 'round',
      rodD: 26.7,
      tol: 0.3,
      wall: 4,
      bodyScale: 1.5,
    },
  },
  {
    id: 'shed-timber',
    name: 'Shed 3m Timber',
    description: '3m timber-framed shed dome with 2×4 lumber',
    settings: {
      freq: 2,
      diam: 3.0,
      trunc: 0.5,
      matType: 'rect',
      lumW: 38,
      lumH: 89,
      tol: 0.4,
      wall: 6,
      bodyScale: 1.7,
    },
  },
  {
    id: 'event-emt',
    name: 'Event 6m EMT',
    description: 'Large event dome with 1" EMT conduit',
    settings: {
      freq: 3,
      diam: 6.0,
      trunc: 0.625,
      matType: 'round',
      rodD: 33.4,
      tol: 0.25,
      wall: 5,
      bodyScale: 1.6,
    },
  },
  {
    id: 'playground-v1',
    name: 'Playground V1',
    description: 'Small V1 climbing dome for kids',
    settings: {
      freq: 1,
      diam: 2.5,
      trunc: 0.75,
      matType: 'round',
      rodD: 21.3,
      tol: 0.35,
      wall: 4,
      bodyScale: 1.4,
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
