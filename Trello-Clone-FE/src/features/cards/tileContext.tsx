import { createContext, useContext } from 'react';

import type { LabelDto, UserSummary } from '@trello-clone/shared';

interface CardTileData {
  /** The board's labels: a tile shows the chips of its `labelIds`. */
  labels: readonly LabelDto[];
  /** The workspace's members: a tile shows the avatars of its `memberIds`. */
  members: readonly UserSummary[];
  /**
   * The cards matching the board's filters (SEARCH-001): the others are dimmed. Null (or absent)
   * when no filter is set.
   */
  matches?: ReadonlySet<string> | null;
}

const CardTileContext = createContext<CardTileData>({ labels: [], members: [] });

/**
 * What the card tiles below it need to show their labels and members. The board page provides it
 * from the data it already holds, so a tile needs no query of its own.
 */
export const CardTileProvider = CardTileContext.Provider;

export const useCardTileData = () => useContext(CardTileContext);
