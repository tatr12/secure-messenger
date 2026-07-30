import Composer from '../Composer/Composer';
import MessageList from '../MessageList/MessageList';
import TopBar from '../TopBar/TopBar';

import './Conversation.css';

export default function Conversation({
  messages = [],
  activeChatUser,
  sendMessage,
  username,
}) {
  return (
    <section className="conversation">
      <TopBar 
        name={activeChatUser || 'Выберите чат'}
      />

      <MessageList 
        messages={messages}
        username={username}
      />

      <Composer
        onSend={sendMessage}
      />
    </section>
  );
}
