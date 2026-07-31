import './DaySeparator.css';

export default function DaySeparator({ label = 'Сегодня' }) {
  return (
    <div className="day-separator" role="separator">
      <span>{label}</span>
    </div>
  );
}