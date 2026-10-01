// Public API of the boards feature: other code imports from '@/features/boards' only.
export { BoardsGrid } from './components/BoardsGrid';
export { BoardView } from './components/BoardView';
export { ActivityFeed } from './components/ActivityFeed';
export { useBoardSocket } from './hooks/useBoardSocket';
export { namesOf, type ActivityNames } from './activity';
export { readableTextColor } from './colors';
export { boardPath } from './paths';
export {
  activityKeys,
  boardChangeKey,
  boardKeys,
  boardMutationScope,
  refetchBoardWhenIdle,
  useBoard,
  useBoards,
} from './queries';
