export const SHARE_TARGET_PARAMS = {
  title: "share_title",
  text: "share_text",
  url: "share_url",
} as const;

export type SharedTodoParams = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
};

const clean = (value?: string | null) => value?.trim() ?? "";

export function isShareTargetSearch(search: string): boolean {
  const params = new URLSearchParams(search);
  return Object.values(SHARE_TARGET_PARAMS).some((name) => params.has(name));
}

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
  if (!isShareTargetSearch(search)) return null;

  const params = new URLSearchParams(search);
  return normalizeSharedTodo({
    title: params.get(SHARE_TARGET_PARAMS.title),
    text: params.get(SHARE_TARGET_PARAMS.text),
    url: params.get(SHARE_TARGET_PARAMS.url),
  });
}

export function stripShareTargetParams(url: URL): string {
  const cleanUrl = new URL(url.toString());
  for (const name of Object.values(SHARE_TARGET_PARAMS)) {
    cleanUrl.searchParams.delete(name);
  }

  const search = cleanUrl.searchParams.toString();
  return `${cleanUrl.pathname}${search ? `?${search}` : ""}${cleanUrl.hash}`;
}
