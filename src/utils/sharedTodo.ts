export const SHARE_TARGET_MARKER = "share-target";

export type SharedTodoParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

const clean = (value?: string | null) => value?.trim() ?? "";

export function normalizeSharedTodo({
  title,
  text,
  url,
}: SharedTodoParams): string | null {
  const cleanTitle = clean(title);
  const cleanText = clean(text);
  const cleanUrl = clean(url);
  const candidates = [cleanTitle, cleanText];

  if (cleanUrl && !cleanText.includes(cleanUrl)) {
    candidates.push(cleanUrl);
  }

  const unique = candidates.filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );

  return unique.length > 0 ? unique.join("\n") : null;
}

export function readSharedTodoFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get(SHARE_TARGET_MARKER) !== "1") return null;

  return normalizeSharedTodo({
    title: params.get("title"),
    text: params.get("text"),
    url: params.get("url"),
  });
}

export function stripShareTargetParams(url: URL): string {
  const cleanUrl = new URL(url.toString());
  cleanUrl.searchParams.delete(SHARE_TARGET_MARKER);
  cleanUrl.searchParams.delete("title");
  cleanUrl.searchParams.delete("text");
  cleanUrl.searchParams.delete("url");

  const search = cleanUrl.searchParams.toString();
  return `${cleanUrl.pathname}${search ? `?${search}` : ""}${cleanUrl.hash}`;
}
