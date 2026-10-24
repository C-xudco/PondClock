import { DIALOGUE_CATALOG } from '../data/dialogueCatalog.js';
import { DialogueDirector } from './dialogueDirector.js';

// Development previews only; each running game owns its own director.
export const SPEECH = Object.freeze(Object.fromEntries(Object.entries(DIALOGUE_CATALOG).map(([event, lines]) =>
  [event, lines.map((line) => line.text)])));
const previewDirector = new DialogueDirector();
export const pickLine = (event) => previewDirector.choose(event, DIALOGUE_CATALOG[event] || DIALOGUE_CATALOG.idle)?.text || '';
