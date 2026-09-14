export const MAX_TODO_TITLE_LENGTH = 2000;

// The length check mirrors the database CHECK, which measures the raw stored
// value; the empty check is a stricter product rule on the trimmed value.
export function isValidTodoTitle(title: string): boolean {
  return (
    title.length <= MAX_TODO_TITLE_LENGTH && title.trim().length > 0
  );
}
