type Props = { title: string; phase: string };

export function PlaceholderPage({ title, phase }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">{title}</h1>
      <p className="text-slate-600">Coming in {phase}.</p>
    </div>
  );
}
