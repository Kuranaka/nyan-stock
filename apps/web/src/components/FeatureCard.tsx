type FeatureCardProps = {
  title: string;
  body: string;
  icon: string;
};

export function FeatureCard({ title, body, icon }: FeatureCardProps) {
  return (
    <article className="rounded-[28px] border border-line bg-card p-6 shadow-soft">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-honey text-2xl">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
    </article>
  );
}
