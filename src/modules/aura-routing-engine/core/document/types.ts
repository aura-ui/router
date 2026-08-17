/** Extracted document metadata: `<title>`, `<html lang|dir>`, and managed `<head>` tags. */
export type DocumentHeadValues = {
  title?: string;
  /** From `<html lang>`. */
  lang?: string;
  /** From `<html dir>`. */
  dir?: string;
  tags?: Record<string, string>;
};
