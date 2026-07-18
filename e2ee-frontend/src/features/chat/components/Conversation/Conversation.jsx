import Composer from '../Composer/Composer';
import MessageList from '../MessageList/MessageList';
import TopBar from '../TopBar/TopBar';

import './Conversation.css';

export default function Conversation() {
  return (
    <section className="conversation">
      <TopBar />
      <MessageList />
      <Composer />
    </section>
  );
}