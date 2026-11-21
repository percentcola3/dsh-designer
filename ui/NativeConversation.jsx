import React from 'react';

const ComposerContent = React.createContext(null);

function ProjectChatView({renderSlot}) {
  return renderSlot('conversation.session', {view:'chat'});
}

const chatOptions = {slots:{views:ProjectChatView}};

export function selectComposerSeat(seat, owner) {
  return owner.sessionId === seat.sessionId && !owner.pendingInteraction ? seat : null;
}

export function DesignerComposerSeat() {
  const content = React.useContext(ComposerContent);
  return <div className="wb-ai-compose" data-designer-composer-seat>{content}</div>;
}

// DSH's embedded body owns the real transcript, lifecycle and interaction chain.
// The designer composer participates only when this exact Session has no pending
// interaction. Native approvals and questions keep their own response handlers.
export default function NativeConversation({composer, sessionId, registerComposer, renderFactorySlot}) {
  const seat = React.useMemo(() => ({sessionId}), [sessionId]);
  React.useLayoutEffect(() => registerComposer(seat), [registerComposer, seat]);
  return <div className="wb-native-conversation" aria-label="AI 对话记录">
    <ComposerContent.Provider value={composer}>
      {renderFactorySlot('conversation.content', {variant: 'embedded', phase: 'active', hero: false}, chatOptions)}
    </ComposerContent.Provider>
  </div>;
}
