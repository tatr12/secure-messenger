import DaySeparator from '../DaySeparator/DaySeparator';
import MessageCard from '../MessageCard/MessageCard';

import './MessageList.css';

const demoMessages = [
  {
    id: 1,
    text: 'Привет! Как продвигается VØIDEN?',
    time: '12:41',
    isMine: false,
  },
  {
    id: 2,
    text: 'Отлично. Сейчас собираю новый интерфейс.',
    time: '12:42',
    isMine: true,
    status: 'Прочитано',
  },
  {
    id: 3,
    text: 'Уже выглядит очень чисто и минималистично.',
    time: '12:43',
    isMine: false,
  },
];

export default function MessageList() {
  return (
    <div className="message-list">
      <DaySeparator label="Сегодня" />

      {demoMessages.map((message) => (
        <MessageCard
          key={message.id}
          text={message.text}
          time={message.time}
          isMine={message.isMine}
          status={message.status}
        />
      ))}
    </div>
  );
}