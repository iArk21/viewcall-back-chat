export default function formatMessage(user, text, meta = {}) {
    return {
      senderId: user?.id || user || "anon",
      senderName: user?.name || null,
      text,
      meta,
      createdAt: new Date()
    };
  }
  