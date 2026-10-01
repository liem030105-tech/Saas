import { createContext, useContext } from 'react';

import type { LabelDto } from '@trello-clone/shared';

const BoardLabelsContext = createContext<readonly LabelDto[]>([]);

/**
 * The board's labels for the card tiles below it (they show the chips of their `labelIds`). The
 * board page provides them from the board it already holds, so a tile needs no query of its own.
 */
export const BoardLabelsProvider = BoardLabelsContext.Provider;

export const useBoardLabels = () => useContext(BoardLabelsContext);
