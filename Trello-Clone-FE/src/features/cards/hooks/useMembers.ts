import { cardMembersApi } from '../api';
import { useToggleOnCard } from './useToggleOnCard';

const TOGGLE_ERROR = "Couldn't update the card's members. Try again.";

/** Assigns a workspace member to the card or unassigns them (POST / DELETE …/members/:userId). */
export const useToggleCardMember = (boardId: string, cardId: string) =>
  useToggleOnCard(boardId, cardId, 'members', {
    attach: cardMembersApi.assign,
    detach: cardMembersApi.unassign,
    error: TOGGLE_ERROR,
  });
