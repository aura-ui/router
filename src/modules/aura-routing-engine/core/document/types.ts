/** Head extracted from a parsed document. Title is special; other tags are keyed by schema ids (`meta:name:description`). */
export type DocumentHeadValues = {
  title?: string;
  tags?: Record<string, string>;
};
