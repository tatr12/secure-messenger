import './EmptyState.css';

export default function EmptyState({
  title,
  subtitle,
}) {
  return (
    <section className="empty-state">
      <div className="empty-state__logo">
        VØ
      </div>

      <h2>{title}</h2>

      <p>{subtitle}</p>
    </section>
  );
}