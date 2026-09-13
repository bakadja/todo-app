export const MAX_TODO_TITLE_LENGTH = 200;

export function isValidTodoTitle(title: string): boolean {
  const trimmed = title.trim();
  return (
    trimmed.length > 0 && trimmed.length <= MAX_TODO_TITLE_LENGTH
  );
}
