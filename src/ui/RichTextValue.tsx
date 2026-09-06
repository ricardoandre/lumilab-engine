// Sanitized HTML renderer for 'richtext' fields — the show-page counterpart
// to RichTextEditor. DOMPurify runs even though content mostly comes from
// our own editor, since some rows were migrated in as raw HTML from
// NocoBase and could contain anything. isomorphic-dompurify (not the plain
// "dompurify" package) so this also works when Next renders it on the
// server, not just in the browser.
import DOMPurify from 'isomorphic-dompurify';

export function RichTextValue({ html }: { html?: string | null }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html);
  return <div className="kano-richtext" dangerouslySetInnerHTML={{ __html: clean }} />;
}
