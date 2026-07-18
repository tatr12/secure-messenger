import ChatList from '../../features/chat/components/ChatList/ChatList';
import Conversation from '../../features/chat/components/Conversation/Conversation';
import Sidebar from '../../features/chat/components/Sidebar/Sidebar';

import './ChatPage.css';

export default function ChatPage() {
  return (
    <main className="chat-page">
      <Sidebar />
      <ChatList />
      <Conversation />
    </main>
  );
}
