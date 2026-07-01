import NoteEditor from './note-editor';

export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <NoteEditor slug={slug} />;
}
