import type { ComponentType } from 'react';
import { EARNINGS, ECO, FX, MKT, NEWS, W, YC } from './markets';
import { PORT } from './portfolio';
import { HELP, RESEARCH, SCREENER, STATUS } from './research';
import { DES, FA, FIL, GP } from './security';
import type { ViewProps } from './types';

/** Function id -> view. Adding a tool = a FunctionDef in @atlas/core plus one entry here. */
export const VIEWS: Record<string, ComponentType<ViewProps>> = { MKT, DES, GP, FA, FIL, NEWS, EARNINGS, ECO, YC, FX, SCREENER, PORT, W, RESEARCH, HELP, STATUS };
